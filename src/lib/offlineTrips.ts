// Fila local de viagens pendentes de sincronização (PWA/offline).
// Usa IndexedDB em vez de localStorage porque precisamos guardar Blobs
// (fotos e assinaturas) — localStorage só aceita strings e tem limite baixo.

export type PendingTripStatus = 'queued' | 'syncing' | 'synced' | 'error'

export interface PendingPhotoData {
  originalBlob?: Blob
  stampedBlob?: Blob
  capturedAt?: string
  latitude?: number
  longitude?: number
  accuracy?: number
  address?: string
  locationDenied?: boolean
}

export interface PendingSignatureData {
  dataUrl: string
  signerName?: string
  method?: string
  signedAt?: string
}

export interface PendingTripPayload {
  formData: Record<string, unknown>
  totalKm: number | null
  photoKmInicial?: PendingPhotoData
  photoKmFinal?: PendingPhotoData
  sigPassageiro?: PendingSignatureData
  sigMotorista?: PendingSignatureData
}

export interface PendingTripRecord {
  id: string
  driverId: string
  protocolo: string
  isDraft: boolean
  status: PendingTripStatus
  error?: string
  createdAt: number
  updatedAt: number
  payload: PendingTripPayload
}

const DB_NAME = 'tv_offline_trips'
const DB_VERSION = 1
const STORE = 'pending_trips'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB indisponível'))
  }
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      // Timeout de segurança: alguns WebViews nunca disparam onsuccess/onerror
      const timer = setTimeout(() => {
        dbPromise = null
        reject(new Error('IndexedDB open timeout'))
      }, 4000)

      let req: IDBOpenDBRequest
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION)
      } catch (err) {
        clearTimeout(timer)
        dbPromise = null
        reject(err)
        return
      }

      req.onupgradeneeded = () => {
        try {
          const db = req.result
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' })
            store.createIndex('driverId', 'driverId', { unique: false })
          }
        } catch {}
      }
      req.onsuccess = () => {
        clearTimeout(timer)
        resolve(req.result)
      }
      req.onerror = () => {
        clearTimeout(timer)
        dbPromise = null
        reject(req.error)
      }
      // onblocked: outra aba tem o DB aberto com versão mais antiga
      req.onblocked = () => {
        clearTimeout(timer)
        dbPromise = null
        reject(new Error('IndexedDB blocked'))
      }
    })
  }
  return dbPromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORE, mode)
    } catch (err) {
      reject(err)
      return
    }
    // tx.onabort cobre: cota excedida, disco cheio, erro interno do navegador.
    // Sem este handler a Promise ficaria pendente para sempre nesses casos.
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction error'))

    const store = tx.objectStore(STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function stripBlobs(record: PendingTripRecord): PendingTripRecord {
  return {
    ...record,
    payload: {
      ...record.payload,
      photoKmInicial: record.payload.photoKmInicial
        ? { ...record.payload.photoKmInicial, originalBlob: undefined, stampedBlob: undefined }
        : undefined,
      photoKmFinal: record.payload.photoKmFinal
        ? { ...record.payload.photoKmFinal, originalBlob: undefined, stampedBlob: undefined }
        : undefined,
    },
  }
}

export async function enqueuePendingTrip(record: PendingTripRecord): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(record))
  } catch {
    // DataCloneError: alguns WebViews do Android não conseguem serializar
    // File/Blob via structured clone. Salva sem as fotos — dados do formulário
    // e assinaturas (dataURL string) são preservados.
    const stripped = stripBlobs(record)
    await withStore('readwrite', (store) => store.put(stripped))
  }
}

export async function listPendingTrips(driverId: string): Promise<PendingTripRecord[]> {
  try {
    const db = await openDb()
    return await new Promise<PendingTripRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
      const index = tx.objectStore(STORE).index('driverId')
      const req = index.getAll(IDBKeyRange.only(driverId))
      req.onsuccess = () => resolve((req.result as PendingTripRecord[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function getPendingTrip(id: string): Promise<PendingTripRecord | undefined> {
  try {
    return await withStore('readonly', (store) => store.get(id))
  } catch {
    return undefined
  }
}

export async function updatePendingTripStatus(
  id: string,
  status: PendingTripStatus,
  error?: string,
): Promise<void> {
  const record = await getPendingTrip(id)
  if (!record) return
  record.status = status
  record.error = error
  record.updatedAt = Date.now()
  await enqueuePendingTrip(record)
}

export async function deletePendingTrip(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(id))
  } catch {}
}
