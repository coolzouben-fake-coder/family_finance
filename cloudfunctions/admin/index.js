const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
// Personal debug endpoint; OpenID validation stays on the server side.
const ADMIN_OPENID = 'oHl_0xWFZ3dlzPEAZ0vUQqCngzg4';
const CRUD_COLLECTIONS = Object.freeze([
  'users', 'projects', 'categories', 'family_assets', 'asset_changes'
]);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function requireAdmin() {
  const openid = cloud.getWXContext().OPENID;
  if (openid !== ADMIN_OPENID) throw new Error('ADMIN_DENIED');
  return openid;
}

function requireCollection(name) {
  const allowed = CRUD_COLLECTIONS.includes(name);
  if (!allowed) throw new Error('COLLECTION_NOT_ALLOWED');
  return name;
}

function requireDocumentId(id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('DOCUMENT_ID_REQUIRED');
  return id.trim();
}

function pagination(event) {
  const requestedLimit = Number(event.limit);
  const requestedOffset = Number(event.offset);
  return {
    limit: Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT,
    offset: Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getDocument(collectionName, id, database = db) {
  try {
    const result = await database.collection(collectionName).doc(requireDocumentId(id)).get();
    if (!result || !result.data) throw new Error('DOCUMENT_NOT_FOUND');
    return result.data;
  } catch (error) {
    if (error && (
      error.message === 'DOCUMENT_NOT_FOUND'
      || error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST'
    )) throw new Error('DOCUMENT_NOT_FOUND');
    throw error;
  }
}

async function queryDocuments(event) {
  const collectionName = requireCollection(event.collection);
  const { limit, offset } = pagination(event);
  const keyword = typeof event.keyword === 'string' ? event.keyword.trim() : '';
  let query;

  if (keyword && collectionName === 'projects') {
    query = db.collection(collectionName).where({
      name: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    });
  } else if (keyword) {
    try {
      return {
        documents: [await getDocument(collectionName, keyword)],
        limit,
        offset
      };
    } catch (error) {
      if (error.message === 'DOCUMENT_NOT_FOUND') return { documents: [], limit, offset };
      throw error;
    }
  } else {
    query = db.collection(collectionName);
  }

  const result = await query.skip(offset).limit(limit).get();
  return { documents: result.data || [], limit, offset };
}

function requireWriteData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('DATA_INVALID');
  if (Object.prototype.hasOwnProperty.call(data, '_id')) throw new Error('DATA_INVALID');
  return data;
}

async function writeDocument(event) {
  const collectionName = requireCollection(event.collection);
  const data = event.action === 'remove' ? undefined : requireWriteData(event.data);
  const target = db.collection(collectionName);

  if (event.action === 'create') {
    const result = await target.add({ data });
    return { document: { _id: result._id, ...data } };
  }

  const id = requireDocumentId(event.id);

  if (event.action === 'update') {
    const before = await getDocument(collectionName, id);
    await target.doc(id).update({ data });
    return { document: { ...before, ...data, _id: id } };
  }

  if (event.action === 'set') {
    await target.doc(id).set({ data });
    return { document: { _id: id, ...data } };
  }

  await target.doc(id).remove();
  return {};
}

exports.main = async (event = {}) => {
  requireAdmin();
  if (event.action === 'check') return { ok: true, isAdmin: true };
  if (event.action === 'listCollections') {
    return {
      ok: true,
      collections: [...CRUD_COLLECTIONS]
    };
  }
  if (event.action === 'query') return { ok: true, ...(await queryDocuments(event)) };
  if (event.action === 'get') {
    const collectionName = requireCollection(event.collection);
    return { ok: true, document: await getDocument(collectionName, event.id) };
  }
  if (['create', 'update', 'set', 'remove'].includes(event.action)) {
    return { ok: true, ...(await writeDocument(event)) };
  }
  throw new Error('UNKNOWN_ACTION');
};

exports.__test = Object.freeze({ ADMIN_OPENID });
