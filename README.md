# In-and-Out

带着目的来，按时离开。

In-and-Out is a local-first Chrome extension for entering distracting sites with a clear purpose. When you open a configured "black hole" site, the page is blurred and asks what you came here to do. After you start, a small draggable timer stays on the page with your goal. When time is up, it rings once and closes the tab.

No account, no server, no analytics. Settings and active sessions stay in Chrome storage.

## 默认拦截

- `bilibili.com`
- `youtube.com`
- `x.com`
- `twitter.com`

## 安装

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the repository folder.
6. Open Bilibili, YouTube, X, or another configured site to test it.

## 设置

在 Chrome 扩展管理页里打开 In-and-Out 的 Details，再点 Extension options，可以修改：

- 默认倒计时分钟数
- 需要拦截的网站域名

所有设置和计时状态都只存在本机浏览器里。

## Inspiration

The visual direction was inspired by the warm, quiet interface language of [Tab Out](https://github.com/zarazhangrui/tab-out).

## License

MIT
