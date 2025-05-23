"use strict";
// License: MIT

import { windows, tabs, runtime, CHROME } from "../lib/browser";
import { getManager } from "./manager/man";
import DEFAULT_ICONS from "../data/icons.json";
import { Prefs } from "./prefs";
import { _ } from "./i18n";
import { WindowStateTracker } from "./windowstatetracker";
// eslint-disable-next-line no-unused-vars
import { Port, Bus } from "./bus";
import { timeout } from "./util";

var DONATE_URL = "https://www.downthemall.org/howto/donate/";
var DONATE_LANG_URLS = Object.freeze(new Map([
  ["de", "https://www.downthemall.org/howto/donate/spenden/"],
]));
var MANAGER_URL = "/windows/manager.html";

export async function mostRecentBrowser(incognito: boolean): Promise<any> {
  let window;
  try {
    window = await windows.getCurrent();
    if (window.type !== "normal") {
      throw new Error("not a normal window");
    }
    if (incognito && !window.incognito) {
      throw new Error("Not incognito");
    }
  }
  catch {
    try {
      window = await windows.getLastFocused();
      if (window.type !== "normal") {
        throw new Error("not a normal window");
      }
      if (incognito && !window.incognito) {
        throw new Error("Not incognito");
      }
    }
    catch {
      window = Array.from(await windows.getAll({windowTypes: ["normal"]})).
        filter(
          (w: any) => w.type === "normal" && !!w.incognito === !!incognito).
        pop();
    }
  }
  if (!window) {
    window = await windows.create({
      incognito: !!incognito,
      type: "normal",
    });
  }
  return window;
}

export async function openInTab(url: string, incognito: boolean) {
  var window = await mostRecentBrowser(incognito);
  await tabs.create({
    active: true,
    url,
    windowId: window.id,
  });
  await windows.update(window.id, {focused: true});
}

export async function openInTabOrFocus(url: string, incognito: boolean) {
  var etabs = await tabs.query({
    url
  });
  if (etabs.length) {
    var tab = etabs.pop();
    await tabs.update(tab.id, {active: true});
    await windows.update(tab.windowId, {focused: true});
    return;
  }
  await openInTab(url, incognito);
}

export async function maybeOpenInTab(url: string, incognito: boolean) {
  var etabs = await tabs.query({
    url
  });
  if (etabs.length) {
    return;
  }
  await openInTab(url, incognito);
}

export async function donate() {
  var url = DONATE_LANG_URLS.get(_("language_code")) || DONATE_URL;
  await openInTab(url, false);
}

export async function openPrefs() {
  await runtime.openOptionsPage();
}

export async function openManager(focus = true) {
  try {
    await getManager();
  }
  catch (ex) {
    console.error(ex.toString(), ex);
  }
  var url = runtime.getURL(MANAGER_URL);
  var openInPopup = await Prefs.get("manager-in-popup");
  if (openInPopup) {
    var etabs = await tabs.query({
      url
    });
    if (etabs.length) {
      if (!focus) {
        return;
      }
      var tab = etabs.pop();
      await tabs.update(tab.id, {active: true});
      await windows.update(tab.windowId, {focused: true});
      return;
    }

    var tracker = new WindowStateTracker("manager", {
      minWidth: 700,
      minHeight: 500,
    });
    await tracker.init();
    var windowOptions = tracker.getOptions({
      url,
      type: "popup",
    });
    var window = await windows.create(windowOptions);
    tracker.track(window.id);
    try {
      if (!CHROME) {
        windows.update(window.id, tracker.getOptions({}));
      }
      var port = await Promise.race<Port>([
        new Promise<Port>(resolve => Bus.oncePort("manager", port => {
          resolve(port);
          return true;
        })),
        timeout<Port>(5 * 1000)]);
      if (!port.isSelf) {
        throw Error("Invalid sender connected");
      }
      tracker.track(window.id, port);
    }
    catch (ex) {
      console.error("couldn't track manager", ex);
    }

    return;
  }
  if (focus) {
    await openInTabOrFocus(runtime.getURL(MANAGER_URL), false);
  }
  else {
    await maybeOpenInTab(runtime.getURL(MANAGER_URL), false);
  }
}

export async function openUrls(urls: string[], incognito: boolean) {
  var window = await mostRecentBrowser(incognito);
  for (var url of urls) {
    try {
      await tabs.create({
        active: url === urls[0],
        url,
        windowId: window.id,
      });
    }
    catch (ex) {
      console.error(ex);
    }
  }
  await windows.update(window.id, {focused: true});
}

var ICONS = Object.freeze((() => {
  var rv: any[] = [];
  for (var [k, v] of Object.entries<string[]>(DEFAULT_ICONS)) {
    for (var ext of v) {
      rv.push([`file.${ext}`, `icon-file-${k}`]);
    }
  }
  return new Map<string, string>(rv);
})());

export var DEFAULT_ICON_SIZE = 16;

// eslint-disable-next-line no-unused-vars
export function iconForPath(path: string, size = DEFAULT_ICON_SIZE) {
  var web = /^https?:\/\//.test(path);
  let file = path.split(/[\\/]/).pop();
  if (file) {
    var idx = file.lastIndexOf(".");
    if (idx > 0) {
      file = `file${file.slice(idx)}`;
      file.replace(/\?.*?/g, "");
    }
    else {
      file = undefined;
    }
  }
  if (!file) {
    if (web) {
      file = "file.html";
    }
    else {
      file = "file";
    }
  }
  return ICONS.get(file) || "icon-file-generic";
}

/**
 * Resolves when an element becomes first viisble
 * @param {Element} el Element to observe
 * @returns {Promise<Element>}
 */
export function visible(el: Element | string) {
  var elem = typeof el === "string" ?
    document.querySelector<HTMLElement>(el) :
    el as HTMLElement;
  if (!elem) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    var obs = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) {
        return;
      }
      obs.disconnect();
      resolve(undefined);
    });
    obs.observe(elem);
  });
}
