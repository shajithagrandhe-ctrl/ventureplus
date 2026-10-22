import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import fs from "node:fs";
import { validateApiUrl } from "../../shared/api-client.ts";

const require = createRequire(import.meta.url);
const buildConfig = require("../app.config.js");

test("tracked production build inputs select the website HTTPS API and normal release identity", async () => {
  // Validate the real tracked template, not a hard-coded URL supplied by this test.
  // This does not attest to a CI override or an installed APK's embedded value.
  const input = Object.fromEntries(fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8")
    .split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
      const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1)];
    }));
  assert.equal(input.EXPO_PUBLIC_BUILD_CHANNEL, "production");
  assert.equal(validateApiUrl(input.EXPO_PUBLIC_API_URL), "https://ventureplus123.vercel.app/api");
  const previous = { channel: process.env.EXPO_PUBLIC_BUILD_CHANNEL, url: process.env.EXPO_PUBLIC_API_URL };
  try {
    process.env.EXPO_PUBLIC_BUILD_CHANNEL = input.EXPO_PUBLIC_BUILD_CHANNEL;
    process.env.EXPO_PUBLIC_API_URL = input.EXPO_PUBLIC_API_URL;
    const config = buildConfig();
    assert.equal(config.android.package, "com.ventureplus.mobile");
    assert.equal(config.version, "1.3.2");
    assert.equal(config.android.versionCode, 7);
    const result = await config.mods.android.manifest({ ...config,
      modResults: { manifest: { application: [{ $: {} }] } }, modRequest: { platform: "android", modName: "manifest" } });
    assert.equal(result.modResults.manifest.application[0].$["android:usesCleartextTraffic"], "false");
    assert.equal(result.modResults.manifest.application[0].$["android:networkSecurityConfig"], undefined);
  } finally {
    for (const [key, value] of [["EXPO_PUBLIC_BUILD_CHANNEL", previous.channel], ["EXPO_PUBLIC_API_URL", previous.url]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("local-test package is isolated and normal release removes the HTTP exception", async () => {
  const previousChannel = process.env.EXPO_PUBLIC_BUILD_CHANNEL;
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  try {
    process.env.EXPO_PUBLIC_API_URL = "http://10.0.2.2:4000/api";
    for (const preview of [false, true]) {
      if (preview) process.env.EXPO_PUBLIC_BUILD_CHANNEL = "local-preview";
      else delete process.env.EXPO_PUBLIC_BUILD_CHANNEL;
      const config = buildConfig();
      assert.equal(config.android.package, preview ? "com.ventureplus.mobile.preview" : "com.ventureplus.mobile");
      const result = await config.mods.android.manifest({
        ...config,
        modResults: { manifest: { application: [{ $: { "android:networkSecurityConfig": "old" } }] } },
        modRequest: { platform: "android", modName: "manifest" }
      });
      const application = result.modResults.manifest.application[0].$;
      assert.equal(application["android:usesCleartextTraffic"], "false");
      assert.equal(application["android:networkSecurityConfig"], preview ? "@xml/local_preview_network_security" : undefined);
    }
  } finally {
    if (previousChannel === undefined) delete process.env.EXPO_PUBLIC_BUILD_CHANNEL;
    else process.env.EXPO_PUBLIC_BUILD_CHANNEL = previousChannel;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousUrl;
  }
});
