import 'dotenv/config'
import { createApp, logMcpBootStatus } from './app.ts'

const port = Number(process.env.PORT || 3000)
const app = createApp()

app.listen(port, () => {
  console.log(`SettlementOS Explorer listening on http://localhost:${port}`)
  logMcpBootStatus()
})
