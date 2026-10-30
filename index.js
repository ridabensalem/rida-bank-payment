import 'dotenv/config'
import express from 'express'
import bodyParser from 'body-parser'
import fetch from 'node-fetch'
import path from 'path'
import { fileURLToPath } from 'url'
import { verifySignature, processEvent } from './webhooks.js'
import { db } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(bodyParser.urlencoded({ extended: false }))
app.use(express.static(path.join(__dirname, 'public')))

async function createSoapCheckout(type) {
  const SOAP_URL = process.env.SOAP_URL
  const SOAP_API_KEY = process.env.SOAP_API_KEY
  const CHECKOUT_URL = `${SOAP_URL}/checkouts`

  if (!SOAP_URL || !SOAP_API_KEY) {
    throw new Error('Server configuration missing: SOAP_URL or SOAP_API_KEY')
  }

  // in your app you would pull the actual user from DB
  const user = db.getUser("cus_12345")
  if (!user) throw new Error('User not found')

  let body = {
    customer_id: "cus_12345", // Use actual user ID
    type: type // "deposit" or "withdrawal"
  }

  if (type === 'withdrawal') {
    body.balance_amount_cents = user.available_balance_cents // the user's withdrawable balance in cents
  }

  const response = await fetch(CHECKOUT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SOAP_API_KEY}` },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Soap API Error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.url // pass url to client for redirect
}

// creating a checkout
app.post('/submit', async (req, res) => {
  const { type } = req.body

  try {
    const redirectUrl = await createSoapCheckout(type)
    res.redirect(redirectUrl)
  } catch (err) {
    console.error('Checkout Error:', err.message)
    res.status(500).send(`Checkout failed: ${err.message}`)
  }
})

app.post('/webhooks', async (req, res) => {
  const rawBody = req.rawBody
  const signature = req.headers['soap-webhook-signature']
  const eventId = req.body.id // Assume the payload has a unique event ID

  if (!signature || !verifySignature(rawBody, signature)) {
    return res.status(401).send('Invalid signature')
  }

  // Idempotency check
  if (eventId && db.isEventProcessed(eventId)) {
    return res.status(200).send('Event already processed')
  }

  try {
    const { balance_change_amount_cents } = processEvent(req.body)
    
    // Persist balance change to DB
    db.updateBalance("cus_12345", balance_change_amount_cents)
    
    if (eventId) db.markEventProcessed(eventId)
    
    return res.status(200).send('OK')
  } catch (err) {
    console.error('Error processing webhook:', err)
    return res.status(500).send('Internal error')
  }
})

app.listen(8008, () => {
  console.log('Server running at http://localhost:8008')
})