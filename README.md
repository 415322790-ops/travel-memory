# Travel Memory · 旅行记忆

Travel Memory 是一座个人旅行记忆档案馆。从 3D 地球上的城市进入旅行档案，再用胶片、日记与时间票根保存一次次到访。它是用于记录和回看个人经历的作品，不是旅游预订或 GIS 数据平台。

## 可以体验什么

- **Globe**：在 Cesium 3D 地球上探索已记录的城市，进入城市档案。
- **City Archive**：查看同一城市的多次旅行、照片数量与旅行封面。
- **Film**：按 Trip 和 Day 浏览照片，编辑日记，整理、裁切和旋转照片。
- **Time Journey**：按时间浏览旅行票根，并进入对应的 Trip。
- **本地保存**：默认使用浏览器 IndexedDB 保存旅行记录和照片。

首次打开可看到内置的演示城市与示例 Trip；它们是源码中的示例内容，不是随仓库发布的私人浏览器记录。

## 本地运行

需要 Node.js 和 npm。克隆或下载仓库后，在项目根目录运行：

```bash
npm install
```

复制 `.env.example` 为 `.env.local`，填写自己的 Cesium ion token：

```dotenv
VITE_CESIUM_ION_TOKEN=你的_Cesium_ion_token
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

保持两个 Supabase 变量为空，即使用本地 IndexedDB 模式。Globe 需要 Cesium token；缺少它时页面会显示配置提示。卫星影像等地图资源仍需要网络连接。

```bash
npm run dev
```

打开终端显示的本地地址。发布构建可使用 `npm run build`；源码检查可使用 `npx eslint src`。

> `.env.local`、`.env.cloud-test` 等本机配置已被 `.gitignore` 排除。不要将 token、个人照片或浏览器数据提交到仓库。`VITE_` 变量会进入前端构建，请勿放入服务端密钥或 Supabase `service_role` key。

## 数据保存与隐私

默认模式下，新增的城市、Trip、Day、日记和上传照片保存在**当前浏览器的 IndexedDB**。它们不会随着仓库源码一起发布，也不会自动同步到另一台设备。换浏览器、清理站点数据或更换设备，可能无法恢复这些记录；请勿将本地模式当作跨设备备份。

仓库 `public/` 中的静态素材会随源码发布，与后来在浏览器中上传的私人照片不同。公开仓库前仍需逐一确认这些素材的隐私与使用授权。

## 可选云端配置

项目包含 Supabase 集成与 [`supabase/schema.sql`](supabase/schema.sql)，但**本地体验不需要 Supabase**。云端同步和跨设备恢复仍在独立测试环境中验收，不应将其视为已验证的备份功能。如果要研究云端模式，请使用独立测试项目和测试数据，不要把生产密钥写入前端配置。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `src/components/` | Globe、城市档案、Film、Time Journey 等界面 |
| `src/context/` | 旅行状态与操作入口 |
| `src/storage/` | IndexedDB 本地持久化 |
| `src/services/` | 可选 Supabase 数据访问 |
| `public/` | 网站运行所需的静态素材 |
| `supabase/` | 云端数据库结构参考 |
| `docs/` | 数据来源与第三方参考说明 |

## 授权与素材

项目原创代码采用 [MIT License](LICENSE)，版权署名为白矮星。该代码许可不代表字体、照片、地图纹理、地理数据或其他第三方素材也按 MIT 授权；相关参考见 [`docs/third-party-notices.md`](docs/third-party-notices.md)。公开发布前仍需分别确认这些素材的使用与再分发权限。
