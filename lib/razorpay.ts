import crypto from 'crypto';
import Razorpay from 'razorpay';
import { RowDataPacket } from 'mysql2';
import { getCentralDbPool } from './db';

type RazorpayOrderInput = {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
};

let razorpayClient: Razorpay | null = null;

function keyId() {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() ?? '';
}

function keySecret() {
  return process.env.RAZORPAY_KEY_SECRET?.trim() ?? '';
}

export function razorpayEnabled() {
  return process.env.RAZORPAY_ENABLED !== 'false' && Boolean(keyId() && keySecret());
}

export function allowSimulatedPaymentFallback() {
  return process.env.ALLOW_SIMULATED_PAYMENT_FALLBACK === 'true';
}

export function getRazorpayKeyId() {
  return keyId();
}

export function getRazorpayClient() {
  if (!razorpayEnabled()) {
    throw new Error('RAZORPAY_NOT_CONFIGURED');
  }
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: keyId(),
      key_secret: keySecret()
    });
  }
  return razorpayClient;
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (Number(row.cnt) === 0) {
    await getCentralDbPool().query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function addIndexIfMissing(tableName: string, indexName: string, definition: string) {
  const [[row]] = await getCentralDbPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  if (Number(row.cnt) === 0) {
    await getCentralDbPool().query(`ALTER TABLE ${tableName} ADD ${definition}`);
  }
}

let paymentTablesPromise: Promise<void> | null = null;

async function initializePaymentTables() {
  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(80) PRIMARY KEY,
      booking_id VARCHAR(80) NULL,
      hold_id VARCHAR(100) NULL,
      show_id VARCHAR(100) NULL,
      provider VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
      payment_mode VARCHAR(40) NOT NULL DEFAULT 'RAZORPAY',
      provider_reference VARCHAR(160) NULL,
      provider_order_id VARCHAR(160) NULL,
      provider_payment_id VARCHAR(160) NULL,
      provider_signature VARCHAR(255) NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      status ENUM('CREATED','PENDING','CAPTURED','COLLECTED','SUCCESS','FAILED','CANCELLED','REFUND_REQUIRED','NEEDS_MANUAL_REVIEW','REFUNDED') NOT NULL DEFAULT 'CREATED',
      authority_mode_at_order VARCHAR(50) NULL,
      channel VARCHAR(30) NOT NULL DEFAULT 'PUBLIC',
      collected_by_user_id VARCHAR(80) NULL,
      counter_code VARCHAR(30) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payments_hold (hold_id),
      INDEX idx_payments_provider_order (provider_order_id),
      INDEX idx_payments_status_created (status, created_at)
    )
  `);

  await getCentralDbPool().query(`
    ALTER TABLE payments MODIFY COLUMN status
      ENUM('CREATED','PENDING','CAPTURED','COLLECTED','SUCCESS','FAILED','CANCELLED','REFUND_REQUIRED','NEEDS_MANUAL_REVIEW','REFUNDED')
      NOT NULL DEFAULT 'CREATED'
  `);
  await getCentralDbPool().query('ALTER TABLE payments MODIFY COLUMN booking_id VARCHAR(80) NULL');
  await addColumnIfMissing('payments', 'hold_id', 'VARCHAR(100) NULL');
  await addColumnIfMissing('payments', 'show_id', 'VARCHAR(100) NULL');
  await addColumnIfMissing('payments', 'payment_mode', "VARCHAR(40) NOT NULL DEFAULT 'RAZORPAY'");
  await addColumnIfMissing('payments', 'provider_order_id', 'VARCHAR(160) NULL');
  await addColumnIfMissing('payments', 'provider_payment_id', 'VARCHAR(160) NULL');
  await addColumnIfMissing('payments', 'provider_signature', 'VARCHAR(255) NULL');
  await addColumnIfMissing('payments', 'currency', "VARCHAR(10) NOT NULL DEFAULT 'INR'");
  await addColumnIfMissing('payments', 'authority_mode_at_order', 'VARCHAR(50) NULL');
  await addColumnIfMissing('payments', 'channel', "VARCHAR(30) NOT NULL DEFAULT 'PUBLIC'");
  await addColumnIfMissing('payments', 'collected_by_user_id', 'VARCHAR(80) NULL');
  await addColumnIfMissing('payments', 'counter_code', 'VARCHAR(30) NULL');
  await addColumnIfMissing('payments', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await addIndexIfMissing('payments', 'idx_payments_hold', 'INDEX idx_payments_hold (hold_id)');
  await addIndexIfMissing('payments', 'idx_payments_provider_order', 'INDEX idx_payments_provider_order (provider_order_id)');
  await addIndexIfMissing('payments', 'idx_payments_status_created', 'INDEX idx_payments_status_created (status, created_at)');

  await getCentralDbPool().query(`
    CREATE TABLE IF NOT EXISTS central_payment_audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      payment_id VARCHAR(80) NULL,
      hold_id VARCHAR(100) NULL,
      show_id VARCHAR(100) NULL,
      action VARCHAR(80) NOT NULL,
      provider VARCHAR(50) NULL,
      provider_order_id VARCHAR(160) NULL,
      provider_payment_id VARCHAR(160) NULL,
      status VARCHAR(50) NULL,
      metadata JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_central_payment_audit_payment (payment_id, created_at),
      INDEX idx_central_payment_audit_show (show_id, created_at)
    )
  `);
}

export function ensureCentralPaymentTables() {
  if (!paymentTablesPromise) {
    paymentTablesPromise = initializePaymentTables().catch((error: unknown) => {
      paymentTablesPromise = null;
      throw error;
    });
  }
  return paymentTablesPromise;
}

export async function writePaymentAudit(input: {
  paymentId?: string | null;
  holdId?: string | null;
  showId?: string | null;
  action: string;
  provider?: string | null;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ensureCentralPaymentTables();
  await getCentralDbPool().query(
    `INSERT INTO central_payment_audit_logs
       (payment_id, hold_id, show_id, action, provider, provider_order_id, provider_payment_id, status, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.paymentId ?? null,
      input.holdId ?? null,
      input.showId ?? null,
      input.action,
      input.provider ?? null,
      input.providerOrderId ?? null,
      input.providerPaymentId ?? null,
      input.status ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );
}

export async function createRazorpayOrder(input: RazorpayOrderInput) {
  const client = getRazorpayClient();
  return client.orders.create({
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt.slice(0, 40),
    notes: input.notes
  });
}

export function verifyRazorpayCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const expected = crypto
    .createHmac('sha256', keySecret())
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function createLocalCounterQr(input: {
  amountPaise: number;
  theatreId: string;
  counterCode: string;
  holdId: string;
  showId: string;
}) {
  const client = getRazorpayClient() as unknown as {
    qrCode?: {
      create: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  };
  if (!client.qrCode?.create) {
    return { available: false as const, message: 'Razorpay QR is not available in this test account. Use manual digital collection for now.' };
  }

  try {
    const qr = await client.qrCode.create({
      type: 'upi_qr',
      name: `KSFDC ${input.counterCode}`,
      usage: 'single_use',
      fixed_amount: true,
      payment_amount: input.amountPaise,
      description: `Counter ${input.counterCode} ${input.showId}`,
      notes: {
        theatreId: input.theatreId,
        counterCode: input.counterCode,
        holdId: input.holdId,
        showId: input.showId
      }
    });
    return {
      available: true as const,
      qrId: String(qr.id ?? ''),
      imageUrl: qr.image_url ? String(qr.image_url) : null,
      status: qr.status ? String(qr.status) : null
    };
  } catch (error) {
    return {
      available: false as const,
      message: 'Razorpay QR is not available in this test account. Use manual digital collection for now.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
