/**
 * Beishan Admin API — Cloudflare Worker
 * 處理管理員驗證與 GitHub API 代理
 */

// ===== CORS =====
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ===== JWT (HMAC-SHA256 via Web Crypto) =====
async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + 86400 }; // 24hr

  const enc = new TextEncoder();
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  const sigB64 = base64url(String.fromCharCode(...new Uint8Array(sig)));

  return `${signingInput}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );

    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(signingInput));
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ===== GitHub API helper =====
async function githubFetch(path, env, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Beishan-Admin-Worker',
      ...options.headers,
    },
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ===== Route Handlers =====

async function handleLogin(request, env, origin) {
  const { username, password } = await request.json();

  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) {
    return jsonResponse({ error: '帳號或密碼錯誤' }, 401, origin);
  }

  const token = await createJWT({ sub: username, role: 'admin' }, env.JWT_SECRET);
  return jsonResponse({ token, message: '登入成功' }, 200, origin);
}

async function handleGetProducts(env, origin) {
  const res = await githubFetch(
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/data/products.json?ref=${env.GITHUB_BRANCH}`,
    env
  );
  if (!res.ok) return jsonResponse({ error: '讀取商品失敗' }, 500, origin);

  const content = atob(res.data.content.replace(/\n/g, ''));
  const products = JSON.parse(decodeURIComponent(escape(content)));
  return jsonResponse({ products, sha: res.data.sha }, 200, origin);
}

async function handleUpdateProducts(request, env, origin) {
  const { products, sha, message } = await request.json();
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(products, null, 2) + '\n')));

  const res = await githubFetch(
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/data/products.json`,
    env,
    {
      method: 'PUT',
      body: JSON.stringify({ message: message || '更新商品資料', content, sha, branch: env.GITHUB_BRANCH }),
    }
  );

  if (!res.ok) return jsonResponse({ error: '更新失敗: ' + (res.data.message || '') }, 500, origin);
  return jsonResponse({ sha: res.data.content.sha, message: '更新成功' }, 200, origin);
}

async function handleUploadImage(request, env, origin) {
  const { filename, content, message } = await request.json();
  const path = `images/${filename}`;

  // Check if file exists
  let sha = null;
  try {
    const existing = await githubFetch(
      `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
      env
    );
    if (existing.ok) sha = existing.data.sha;
  } catch {}

  const body = { message: message || `上傳圖片: ${filename}`, content, branch: env.GITHUB_BRANCH };
  if (sha) body.sha = sha;

  const res = await githubFetch(
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
    env,
    { method: 'PUT', body: JSON.stringify(body) }
  );

  if (!res.ok) return jsonResponse({ error: '上傳失敗' }, 500, origin);
  return jsonResponse({ path, message: '上傳成功' }, 200, origin);
}

async function handleDeleteImage(request, env, origin) {
  const { path, message } = await request.json();

  // Get file SHA
  const file = await githubFetch(
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    env
  );
  if (!file.ok) return jsonResponse({ error: '找不到檔案' }, 404, origin);

  const res = await githubFetch(
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
    env,
    {
      method: 'DELETE',
      body: JSON.stringify({ message: message || `刪除: ${path}`, sha: file.data.sha, branch: env.GITHUB_BRANCH }),
    }
  );

  if (!res.ok) return jsonResponse({ error: '刪除失敗' }, 500, origin);
  return jsonResponse({ message: '刪除成功' }, 200, origin);
}

// ===== Main Router =====
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Login (no JWT needed)
    if (path === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env, origin);
    }

    // All other routes need JWT (except GET /api/products)
    if (path.startsWith('/api/')) {
      const isGetProducts = path === '/api/products' && request.method === 'GET';

      if (!isGetProducts) {
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) {
          return jsonResponse({ error: '未授權' }, 401, origin);
        }

        const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET);
        if (!payload) {
          return jsonResponse({ error: 'Token 無效或已過期' }, 401, origin);
        }
      }

      // Route
      if (path === '/api/products' && request.method === 'GET') {
        return handleGetProducts(env, origin);
      }
      if (path === '/api/products' && request.method === 'PUT') {
        return handleUpdateProducts(request, env, origin);
      }
      if (path === '/api/upload' && request.method === 'POST') {
        return handleUploadImage(request, env, origin);
      }
      if (path === '/api/delete-image' && request.method === 'POST') {
        return handleDeleteImage(request, env, origin);
      }
    }

    return jsonResponse({ error: 'Not Found' }, 404, origin);
  },
};
