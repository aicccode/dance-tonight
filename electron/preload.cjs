// Minimal, typed-by-convention bridge: renderer can only call dt:* channels.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("dt", {
  async call(channel, ...args) {
    if (!/^[a-zA-Z]+$/.test(channel)) throw new Error("bad channel");
    const res = await ipcRenderer.invoke(`dt:${channel}`, ...args);
    if (!res.ok) throw new Error(res.error);
    return res.data;
  },
  /** Absolute path of a dropped File (drag & drop into the library). */
  pathForFile: (file) => webUtils.getPathForFile(file),
  platform: process.platform,
});
