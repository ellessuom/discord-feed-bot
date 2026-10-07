import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * CONFIG_PATH / DATA_DIR let dev runs point at a scratch config and data folder,
 * so testing against a dev Discord server never touches the committed
 * production config.yaml or data/*.json (proposals.json is a permanent backlog).
 */
export const configPath = process.env.CONFIG_PATH
  ? path.resolve(process.env.CONFIG_PATH)
  : path.resolve(projectRoot, 'config.yaml')

export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(projectRoot, 'data')
