import admin from 'firebase-admin'
import { createMerchSyncHandler } from './_lib/merch-sync.js'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
  // REST instead of gRPC — avoids RESOURCE_EXHAUSTED on serverless cold starts
  try { admin.firestore().settings({ preferRest: true }) } catch {}
}

// GET /api/merch-sync — склад и журнал мерча для зеркала в платформе маркетинга
// (marketing.herosjourney.kz); прод — ticket-tracker-inky.vercel.app.
// Server-to-server: ключ в заголовке x-api-key, никакого CORS.
// Контракт и правила опроса — docs/merch-sync-api.md
export default createMerchSyncHandler({
  getDb: () => admin.firestore(),
  getApiKey: () => process.env.MERCH_API_KEY,
})
