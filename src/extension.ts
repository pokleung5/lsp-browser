import * as vscode from 'vscode';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import { resolveCliPathFromVSCodeExecutablePath } from 'vscode-test';
import { notDeepEqual } from 'assert';

const EXTENSION_NAME = "lsp-browser";

function getConfig<T>(configPath: string): T {
	return vscode.workspace.getConfiguration().get(EXTENSION_NAME + "." + configPath) as T;
}

// const puppeteer = require('puppeteer');
let browser;
let page;
//
let last_url: String;
let cache_suggest: Object = {};
let trigger_char = getConfig<string>("trigger_char");

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

export async function activate(context: vscode.ExtensionContext) {

	console.log("lsp-browser: activated !!");
	if (browser === undefined) {
		console.log("lsp-browser: creating new browser !!");
		browser = await puppeteer.launch();
	}

	context.subscriptions.push(vscode.commands.registerCommand(EXTENSION_NAME + '.useURL',
		async () => {
			const htmlfile = await getInput('Enter the full path of the files');

			if (htmlfile) {
				if (page !== undefined) {
					await page.close();
				}
				page = await browser.newPage();
				last_url = completeUri(htmlfile)
				await page.goto(last_url);
			}
		}
	));

	context.subscriptions.push(vscode.commands.registerCommand(EXTENSION_NAME + '.addScript',
		async () => {
			const javafiles = await getInput('Enter the full path of the files');
			if (javafiles) {
				if (page === undefined) {
					page = await browser.newPage();
					await page.goto("file:///" + __dirname + "/empty.html");
					// await page.goto("about:blank");
				}
				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "Loading javascript: " + javafiles,
					cancellable: false
				}, (progress, token) => {
					return new Promise(async (resolve, token) => {
						try {
							await page.addScriptTag({ url: completeUri(javafiles) });
						} catch (e) {
							vscode.window.showErrorMessage(e.message);
						}
						resolve(true);
					});
				});
			}
		}
	));

	context.subscriptions.push(vscode.commands.registerCommand(EXTENSION_NAME + '.reloadPage',
		async () => {
			if (page !== undefined && last_url !== undefined) {
				await page.reload();
			}
		}
	));

	context.subscriptions.push(vscode.commands.registerCommand(EXTENSION_NAME + '.clearPage',
		async () => {
			if (page !== undefined) {
				await page.clear();
				page = undefined;
				last_url = undefined;
			}
		}
	));

	vscode.languages.registerCompletionItemProvider('javascript', {

		provideCompletionItems: async (document, position) => {

			var suggestions = [];

			if (page === undefined) {
				return suggestions;
			}
			// update config
			var cache_timeout = getConfig<number>("cache_timeout");
			var suggest_window = getConfig<boolean>("suggest_window");

			// 
			var start_pos = document.lineAt(position).range.start;
			var word = document.getText(new vscode.Range(start_pos, position)).match("[^ ]+$")[0];

			var rdot_idx = word.lastIndexOf('.');
			var last_part = word.substr(rdot_idx + 1);
			var match_part = undefined;

			if (rdot_idx >= 0) {
				match_part = word.substr(0, rdot_idx);
			} else if (suggest_window) {
				match_part = "window";
			}

			if (cache_suggest.hasOwnProperty(match_part)) {
				return cache_suggest[match_part];
			}

			try {

				if (match_part !== undefined) {
					var result = await page.evaluate(
						"JSON.stringify" +
						wrap("Reflect.ownKeys" + wrap(match_part))
					);
					suggestions = JSON.parse(result);
				}

				for (var i = 0; i < suggestions.length; i++) {

					var type = await page.evaluate(
						"typeof " +
						wrap(match_part + "." + suggestions[i])
					);

					switch (type) {
						case "function":
							type = vscode.CompletionItemKind.Function;
							break;
						case "object":
							type = vscode.CompletionItemKind.Method;
							break;
						default:
							type = vscode.CompletionItemKind.Value;
							break;
					}

					suggestions[i] = new vscode.CompletionItem(
						suggestions[i], type
					);

					if (cache_timeout >= 0) {
						// store result as cache
						cache_suggest[match_part] = suggestions;
						// delete it after timeout, but dont not delete cache if cache_timeout = 0
						if (cache_timeout > 0) {
							setTimeout(function () {
								delete cache_suggest[match_part];
							}, cache_timeout);
						}
					}
				}
				console.log(match_part, suggestions.length);
			} catch (e) {
				console.log(e.message);
			}

			return suggestions;
		}
	}, trigger_char);
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
