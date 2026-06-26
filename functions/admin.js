const COOKIE = 'bsd_session';

// ── HMAC helpers ─────────────────────────────────────────────────────────────

async function makeToken(secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('admin'));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `admin.${b64}`;
}

async function verifyToken(token, secret) {
  if (!token) return false;
  const expected = await makeToken(secret);
  return token === expected;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v || '');
  }
  return null;
}

function setCookieHeader(value, maxAge = 3600 * 8) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// ── Image → base64 ────────────────────────────────────────────────────────────

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── KV helpers ────────────────────────────────────────────────────────────────

async function getIndex(env) {
  return (await env.POSTS.get('post:index', 'json')) || [];
}

async function savePost(env, post) {
  const key = `post:${post.id}`;
  await env.POSTS.put(key, JSON.stringify(post));
  const index = await getIndex(env);
  index.unshift(key);
  await env.POSTS.put('post:index', JSON.stringify(index));
}

async function deletePost(env, id) {
  const key = `post:${id}`;
  await env.POSTS.delete(key);
  const index = (await getIndex(env)).filter(k => k !== key);
  await env.POSTS.put('post:index', JSON.stringify(index));
}

async function getAllPosts(env) {
  const index = await getIndex(env);
  const posts = await Promise.all(index.map(k => env.POSTS.get(k, 'json')));
  return posts.filter(Boolean);
}

// ── HTML templates ────────────────────────────────────────────────────────────

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Open Sans',Arial,sans-serif;background:#f4fbf6;color:#1a1a1a;line-height:1.6}
  a{color:#1e7e34;text-decoration:none}
  .wrap{max-width:760px;margin:0 auto;padding:32px 16px}
  h1{font-size:24px;font-weight:800;color:#1e7e34;margin-bottom:24px}
  h2{font-size:18px;font-weight:700;color:#1e7e34;margin:32px 0 12px}
  .card{background:#fff;border-radius:12px;padding:28px;box-shadow:0 4px 16px rgba(0,0,0,.08);margin-bottom:24px}
  label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}
  input,textarea{width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:8px;font:inherit;margin-bottom:16px}
  textarea{min-height:140px;resize:vertical}
  .btn{display:inline-block;padding:10px 22px;border-radius:8px;font-weight:700;font-size:14px;border:none;cursor:pointer}
  .btn-green{background:#28a745;color:#fff}
  .btn-red{background:#ec2d3f;color:#fff;padding:6px 14px;font-size:13px}
  .btn-green:hover{background:#1e7e34}
  .btn-red:hover{background:#c0202f}
  .post-row{display:flex;gap:12px;align-items:flex-start;padding:16px 0;border-bottom:1px solid #eee}
  .post-row:last-child{border-bottom:none}
  .post-thumb{width:72px;height:72px;object-fit:cover;border-radius:8px;flex-shrink:0}
  .post-info{flex:1}
  .post-title{font-weight:700;margin-bottom:4px}
  .post-date{font-size:13px;color:#6c757d}
  .msg{padding:12px 16px;border-radius:8px;margin-bottom:20px;font-weight:600}
  .msg-ok{background:#d4edda;color:#155724}
  .msg-err{background:#f8d7da;color:#721c24}
`;

function loginPage(err = '') {
  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin — Đăng nhập</title>
<style>${CSS}</style></head>
<body><div class="wrap">
  <h1>Đăng nhập quản trị</h1>
  ${err ? `<div class="msg msg-err">${err}</div>` : ''}
  <div class="card">
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="login"/>
      <label for="u">Tên đăng nhập</label>
      <input id="u" name="username" type="text" required autocomplete="username"/>
      <label for="p">Mật khẩu</label>
      <input id="p" name="password" type="password" required autocomplete="current-password"/>
      <button class="btn btn-green" type="submit">Đăng nhập</button>
    </form>
  </div>
</div></body></html>`;
}

function dashboardPage(posts, msg = '', msgType = 'ok') {
  const postRows = posts.length
    ? posts.map(p => `
      <div class="post-row">
        ${p.imageBase64
          ? `<img class="post-thumb" src="data:${p.imageMime};base64,${p.imageBase64}" alt="${p.title}"/>`
          : ''}
        <div class="post-info">
          <div class="post-title">${p.title}</div>
          <div class="post-date">${new Date(p.createdAt).toLocaleDateString('vi-VN')}</div>
        </div>
        <form method="POST" action="/admin" onsubmit="return confirm('Xoá bài này?')">
          <input type="hidden" name="action" value="delete"/>
          <input type="hidden" name="id" value="${p.id}"/>
          <button class="btn btn-red" type="submit">Xoá</button>
        </form>
      </div>`).join('')
    : '<p style="color:#6c757d">Chưa có bài viết nào.</p>';

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin — Cẩm nang sức khỏe</title>
<style>${CSS}</style></head>
<body><div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
    <h1 style="margin:0">Quản lý Cẩm nang</h1>
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="logout"/>
      <button class="btn" style="background:#eee;color:#333">Đăng xuất</button>
    </form>
  </div>

  ${msg ? `<div class="msg msg-${msgType}">${msg}</div>` : ''}

  <h2>Thêm bài viết mới</h2>
  <div class="card">
    <form method="POST" action="/admin" enctype="multipart/form-data">
      <input type="hidden" name="action" value="create"/>
      <label for="title">Tiêu đề *</label>
      <input id="title" name="title" type="text" placeholder="Nhập tiêu đề bài viết" required/>
      <label for="body">Nội dung *</label>
      <textarea id="body" name="body" placeholder="Nhập nội dung (mỗi đoạn cách nhau bằng một dòng trống)" required></textarea>
      <label for="photo">Ảnh (không bắt buộc)</label>
      <input id="photo" name="photo" type="file" accept="image/*"/>
      <button class="btn btn-green" type="submit">Đăng bài</button>
    </form>
  </div>

  <h2>Bài viết đã đăng (${posts.length})</h2>
  <div class="card">${postRows}</div>
</div></body></html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // ── GET /admin ──────────────────────────────────────────────────────────────
  if (method === 'GET') {
    const token = getCookie(request, COOKIE);
    const valid = await verifyToken(token, env.ADMIN_PASS);
    if (!valid) {
      return new Response(loginPage(), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }
    const posts = await getAllPosts(env);
    return new Response(dashboardPage(posts), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  // ── POST /admin ─────────────────────────────────────────────────────────────
  if (method === 'POST') {
    const ct = request.headers.get('Content-Type') || '';
    let action, formData;

    if (ct.includes('multipart/form-data')) {
      formData = await request.formData();
      action = formData.get('action');
    } else {
      formData = await request.formData();
      action = formData.get('action');
    }

    // Login
    if (action === 'login') {
      const username = formData.get('username');
      const password = formData.get('password');
      if (username === env.ADMIN_USER && password === env.ADMIN_PASS) {
        const token = await makeToken(env.ADMIN_PASS);
        return new Response('', {
          status: 302,
          headers: { Location: '/admin', 'Set-Cookie': setCookieHeader(token) },
        });
      }
      return new Response(loginPage('Sai tên đăng nhập hoặc mật khẩu.'), {
        status: 401,
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    // All actions below require a valid session
    const token = getCookie(request, COOKIE);
    const valid = await verifyToken(token, env.ADMIN_PASS);
    if (!valid) {
      return new Response('', { status: 302, headers: { Location: '/admin' } });
    }

    // Logout
    if (action === 'logout') {
      return new Response('', {
        status: 302,
        headers: { Location: '/admin', 'Set-Cookie': setCookieHeader('', 0) },
      });
    }

    // Create post
    if (action === 'create') {
      const title = (formData.get('title') || '').trim();
      const body  = (formData.get('body')  || '').trim();
      if (!title || !body) {
        const posts = await getAllPosts(env);
        return new Response(dashboardPage(posts, 'Tiêu đề và nội dung không được để trống.', 'err'), {
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      }

      const photo = formData.get('photo');
      let imageBase64 = null, imageMime = null;
      if (photo && photo.size > 0) {
        imageBase64 = await fileToBase64(photo);
        imageMime = photo.type || 'image/jpeg';
      }

      const id = Date.now().toString();
      await savePost(env, { id, title, body, imageBase64, imageMime, createdAt: new Date().toISOString() });

      const posts = await getAllPosts(env);
      return new Response(dashboardPage(posts, 'Bài viết đã được đăng thành công!', 'ok'), {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }

    // Delete post
    if (action === 'delete') {
      const id = (formData.get('id') || '').trim();
      if (id) await deletePost(env, id);
      const posts = await getAllPosts(env);
      return new Response(dashboardPage(posts, 'Bài viết đã được xoá.', 'ok'), {
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }
  }

  return new Response('Not found', { status: 404 });
}
