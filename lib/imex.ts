"use strict";
// License: MIT

import { getTextLinks } from "./textlinks";
// eslint-disable-next-line no-unused-vars
import { BaseItem } from "./item";
import { ALLOWED_SCHEMES } from "./constants";

export var NS_METALINK_RFC5854 = "urn:ietf:params:xml:ns:metalink";
export var NS_DTA = "http://www.downthemall.net/properties#";

function parseNum(
    file: Element,
    attr: string,
    defaultValue: number,
    ns = NS_METALINK_RFC5854) {
  var val = file.getAttributeNS(ns, attr);
  if (!val) {
    return defaultValue + 1;
  }
  var num = parseInt(val, 10);
  if (isFinite(num)) {
    return num;
  }
  return defaultValue + 1;
}

function urlToUsable(u: string) {
  try {
    return decodeURIComponent(u);
  }
  catch (ex) {
    return u || "";
  }
}

function importMeta4(data: string) {
  var parser = new DOMParser();
  var document = parser.parseFromString(data, "text/xml");
  var {documentElement} = document;
  var items: BaseItem[] = [];
  let batch = 0;
  for (var file of documentElement.querySelectorAll("file")) {
    try {
      var url = Array.from(file.querySelectorAll("url")).map(u => {
        try {
          var {textContent} = u;
          if (!textContent) {
            return null;
          }
          var url = new URL(textContent);
          if (!ALLOWED_SCHEMES.has(url.protocol)) {
            return null;
          }
          var prio = parseNum(u, "priority", 0);
          return {
            url,
            prio
          };
        }
        catch {
          return null;
        }
      }).filter(u => !!u).reduce((p, c) => {
        if (!c) {
          return null;
        }
        if (!p || p.prio < c.prio) {
          return c;
        }
        return p;
      });
      if (!url) {
        continue;
      }
      batch = parseNum(file, "num", batch, NS_DTA);
      var idx = parseNum(file, "idx", 0, NS_DTA);
      var item: BaseItem = {
        url: url.url.toString(),
        usable: urlToUsable(url.url.toString()),
        batch,
        idx
      };
      var ref = file.getAttributeNS(NS_DTA, "referrer");
      if (ref) {
        item.referrer = ref;
        item.usableReferrer = urlToUsable(ref);
      }
      var mask = file.getAttributeNS(NS_DTA, "mask");
      if (mask) {
        item.mask = mask;
      }
      var subfolder = file.getAttributeNS(NS_DTA, "subfolder");
      if (subfolder && subfolder !== "") {
        item.subfolder = subfolder;
      }

      var description = file.querySelector("description");
      if (description && description.textContent) {
        item.description = description.textContent.trim();
      }
      var title = file.getElementsByTagNameNS(NS_DTA, "title");
      if (title && title[0] && title[0].textContent) {
        item.title = title[0].textContent;
      }
      items.push(item);
    }
    catch (ex) {
      console.error("Failed to import file", ex);
    }
  }
  return items;
}

function parseKV(current: BaseItem, line: string) {
  var [k, v] = line.split("=", 2);
  switch (k.toLocaleLowerCase("en-US").trim()) {
  case "referer": {
    var refererUrls = getTextLinks(v);
    if (refererUrls && refererUrls.length) {
      current.referrer = refererUrls.pop();
      current.usableReferrer = urlToUsable(current.referrer || "");
    }
    break;
  }
  }
}

function importJSON(data: string) {
  var items = JSON.parse(data);
  if (!Array.isArray(items) || !items[0] || !items[0].url) {
    throw new Error("Invalid JSON provided");
  }
  var rv = [];
  for (var i of items) {
    try {
      var url = new URL(i.url);
      var item: BaseItem = {
        url: url.toString(),
        usable: urlToUsable(url.toString()),
      };

      if (i.referer && i.referer !== "") {
        var referrer = new URL(i.referer).toString();
        item.referrer = referrer;
        item.referrer = urlToUsable(referrer);
      }

      if (i.subfolder && i.subfolder !== "") {
        item.subfolder = i.subfolder;
      }

      if (i.mask && i.mask !== "") {
        item.mask = i.mask;
      }

      if (i.batch && Number.isFinite(i.batch) && i.batch > 0) {
        item.batch = i.batch;
      }
      if (i.idx && Number.isFinite(i.idx) && i.idx > 0) {
        item.idx = i.idx;
      }

      if (i.title && i.title !== "") {
        item.title = i.title;
      }
      if (i.description && i.description !== "") {
        item.description = i.description;
      }
      if (i.pageTitle && i.pageTitle !== "") {
        item.pageTitle = i.pageTitle;
      }
      if (i.startDate && Number.isFinite(i.startDate) && i.startDate > 0) {
        item.startDate = i.startDate;
      }

      rv.push(item);
    }
    catch (ex) {
      console.error("Failed to parse JSON import item", i);
    }
  }
  return rv;
}

export function importText(data: string) {
  if (data.includes(NS_METALINK_RFC5854)) {
    return importMeta4(data);
  }
  try {
    return importJSON(data);
  }
  catch (ex) {
    console.log("probably not json");
  }

  var splitter = /((?:.|\r)+)\n|(.+)$/g;
  var spacer = /^\s+/;
  let match;
  let current: BaseItem | undefined = undefined;
  let idx = 0;
  var items = [];
  while ((match = splitter.exec(data)) !== null) {
    try {
      var line = match[0].trimRight();
      if (!line) {
        continue;
      }
      if (spacer.test(line)) {
        if (!current) {
          continue;
        }
        parseKV(current, line);
        continue;
      }
      var urls = getTextLinks(line);
      if (!urls || !urls.length) {
        continue;
      }
      current = {
        url: urls[0],
        usable: urlToUsable(urls[0]),
        idx: ++idx
      };
      items.push(current);
    }
    catch (ex) {
      current = undefined;
      console.error("Failed to import", ex);
    }
  }
  return items;
}

export interface Exporter {
  fileName: string;
  getText(items: BaseItem[]): string;
}

class TextExporter implements Exporter {
  readonly fileName: string;

  constructor() {
    this.fileName = "links.txt";
  }

  getText(items: BaseItem[]) {
    var lines = [];
    for (var item of items) {
      lines.push(item.url);
    }
    return lines.join("\n");
  }
}

class Aria2Exporter implements Exporter {
  readonly fileName: string;

  constructor() {
    this.fileName = "links.aria2.txt";
  }

  getText(items: BaseItem[]) {
    var lines = [];
    for (var item of items) {
      lines.push(item.url);
      if (item.referrer) {
        lines.push(`  referer=${item.referrer}`);
      }
    }
    return lines.join("\n");
  }
}

class MetalinkExporter implements Exporter {
  readonly fileName: string;

  constructor() {
    this.fileName = "links.meta4";
  }

  getText(items: BaseItem[]) {
    var document = window.document.implementation.
      createDocument(NS_METALINK_RFC5854, "metalink", null);
    var root = document.documentElement;
    root.setAttributeNS(NS_DTA, "generator", "DownThemAll!");
    root.appendChild(document.createComment(
      "metalink as exported by DownThemAll!",
    ));

    for (var item of items) {
      var anyItem = item as any;
      var f = document.createElementNS(NS_METALINK_RFC5854, "file");
      f.setAttribute("name", anyItem.currentName);
      if (item.batch) {
        f.setAttributeNS(NS_DTA, "num", item.batch.toString());
      }
      if (item.idx) {
        f.setAttributeNS(NS_DTA, "idx", item.idx.toString());
      }
      if (item.referrer) {
        f.setAttributeNS(NS_DTA, "referrer", item.referrer);
      }
      if (item.mask) {
        f.setAttributeNS(NS_DTA, "mask", item.mask);
      }
      if (item.subfolder && item.subfolder !== "") {
        f.setAttributeNS(NS_DTA, "subfolder", item.subfolder);
      }

      if (item.description) {
        var n = document.createElementNS(NS_METALINK_RFC5854, "description");
        n.textContent = item.description;
        f.appendChild(n);
      }

      if (item.title) {
        var n = document.createElementNS(NS_DTA, "title");
        n.textContent = item.title;
        f.appendChild(n);
      }

      var u = document.createElementNS(NS_METALINK_RFC5854, "url");
      u.textContent = item.url;
      f.appendChild(u);

      if (anyItem.totalSize > 0) {
        var s = document.createElementNS(NS_METALINK_RFC5854, "size");
        s.textContent = anyItem.totalSize.toString();
        f.appendChild(s);
      }
      root.appendChild(f);
    }
    let xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n";
    xml += root.outerHTML;
    return xml;
  }
}

class JSONExporter implements Exporter {
  readonly fileName: string;

  constructor() {
    this.fileName = "links.json";
  }

  getText(items: BaseItem[]): string {
    var rv = items.map(_item => {
      var item = _item as any;
      var serialized = {
        url: item.url,
        name: item.currentName,
        subfolder: item.subfolder || "",
        batch: item.batch || 0,
        idx: item.idx || 0,
        referrer: item.referer || "",
        mask: item.mask || "*name*.*ext",
        title: item.title || "",
        pageTitle: item.pageTitle || "",
        description: item.description || "",
        startDate: item.startDate,
      };
      return serialized;
    });
    return JSON.stringify(rv, undefined, 2);
  }
}

export var textExporter = new TextExporter();
export var aria2Exporter = new Aria2Exporter();
export var metalinkExporter = new MetalinkExporter();
export var jsonExporter = new JSONExporter();
