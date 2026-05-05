import { config } from 'dotenv'
import path from 'node:path'

// Side-effect import: 后端任何入口（server.ts / drizzle.config.ts / scripts/*.ts）
// 在最顶部 `import './env-loader'` 一次即可。
//
// 加载顺序：.env.local 优先（与 Next.js 习惯一致，是本地覆盖文件，不进 git），
// 然后 .env（默认配置或团队共享）。dotenv 默认 override=false，
// 即先加载的设值不会被后加载的覆盖。

const root = process.cwd()

config({ path: path.join(root, '.env.local') })
config({ path: path.join(root, '.env') })
