import * as vscode from 'vscode';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import { resolveCliPathFromVSCodeExecutablePath } from 'vscode-test';

// const puppeteer = require('puppeteer');
let browser;
let page;

function wrap(str: string) {
	return "(" + str + ")";
}

function completeUri(uri: string) {
	if (uri.indexOf("://") === -1) {
		return "file://" + uri;
	}
	return uri;
}

async function getInput(placeholder: string) {
	const result = await vscode.window.showInputBox({
		placeHolder: placeholder,
		value: ""
	});
	return new Promise<string>((resolve) => {
		resolve(result);
	});
}

async function checkPageExist() {
	if (page === undefined) {
		page = await browser.newPage();
		await page.goto("file:///" + __dirname + "/empty.html");
		return false;
	}
	return true;
}

async function evaluateJS(str: string) {
	checkPageExist();
	const result = await page.evaluate("JSON.stringify" + wrap(str));
	return new Promise<any[]>((resolve) => {
		resolve(JSON.parse(result));
	});
}


export function activate(context: vscode.ExtensionContext) {

	console.log("lsp-browser: activated !!");

	(async () => {
		if (browser === undefined) {
			console.log("lsp-browser: creating new browser !!");
			browser = await puppeteer.launch();
		}

		context.subscriptions.push(vscode.commands.registerCommand('lsp-browser.useURL',
			async () => {
				const htmlfile = await getInput('Enter the full path of the files');

				if (htmlfile) {
					if (page !== undefined) {
						await page.close();
					}
					page = await browser.newPage();
					await page.goto(completeUri(htmlfile));
				}
			}
		));

		context.subscriptions.push(vscode.commands.registerCommand('lsp-browser.addScript',
			async () => {
				checkPageExist()
				const javafiles = await getInput('Enter the full path of the files');
				if (javafiles) {
					try {
						await page.addScriptTag({ url: completeUri(javafiles) });
					} catch (e) {
						vscode.window.showErrorMessage(JSON.stringify(e));
					}
				}
			}
		));

		context.subscriptions.push(vscode.commands.registerCommand('lsp-browser.clearPage',
			async () => {
				if (page !== undefined) {
					await page.clear();
					page = undefined;
				}
			}
		));

		context.subscriptions.push(vscode.commands.registerCommand('lsp-browser.completeJs',
			async () => {

				const vars = await getInput('Enter String to evaluate');

				var suggestions = [];
				var rdot_idx = vars.lastIndexOf('.');
				var last_part = vars.substr(rdot_idx + 1).replace(' ', '');
				var match_part = "window";

				if (rdot_idx >= 0) {
					match_part = vars.substr(0, rdot_idx);
				}
				try {
					suggestions = await evaluateJS("Reflect.ownKeys" + wrap(match_part));

					if (last_part) {
						suggestions = suggestions.filter(x => {
							return x.startsWith(last_part);
						});
					}
				} catch (e) { 
					vscode.window.showErrorMessage(JSON.stringify(e));
				}
				console.log(suggestions);
			}
		));

	})();
}

export function deactivate() {
	// kill browser
	if (browser) {
		(async () => {
			console.log("lsp-browser: Closing browser !!");
			if (page !== undefined) {
				await page.close();
			}
			await browser.close();
		})();
	}
}
