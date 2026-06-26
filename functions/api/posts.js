export async function onRequestGet({ env }) {
  const index = (await env.POSTS.get('post:index', 'json')) || [];
  const posts = await Promise.all(index.map(key => env.POSTS.get(key, 'json')));
  return new Response(JSON.stringify(posts.filter(Boolean)), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
