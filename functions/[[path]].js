const ADMIN_REG_CODE = "Fl890313";
export async function onRequest(context) {
  const { request, env } = context;
  const DB = env.DB;
  const url = new URL(request.url);
  const path = url.pathname;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") return new Response(null, { headers });
  try {
        // 注册
    if (path === "/api/register" && request.method === "POST") {
      const { username, password, student_id, is_admin, admin_code } = await request.json();
      if (!username || !password || !student_id) return Response.json({ ok: false, msg: "昵称、学号、密码不能为空" }, { headers });
      if (is_admin && admin_code !== ADMIN_REG_CODE) return Response.json({ ok: false, msg: "管理员注册码错误" }, { headers });
      try {
        const r = await DB.prepare("INSERT INTO users(username,password,student_id,is_admin) VALUES(?,?,?,?)").bind(username, password, student_id, is_admin ? 1 : 0).run();
        const user = await DB.prepare("SELECT id,username,student_id,is_admin FROM users WHERE id=?").bind(r.meta.last_row_id).first();
        return Response.json({ ok: true, msg: "注册成功", user }, { headers });
      } catch (e) {
        return Response.json({ ok: false, msg: "昵称已存在" }, { headers });
      }
    }
       // 登录
    if (path === "/api/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const user = await DB.prepare("SELECT id,username,student_id,is_admin FROM users WHERE username=? AND password=?").bind(username, password).first();
      if (!user) return Response.json({ ok: false, msg: "昵称或密码错误" }, { headers });
      return Response.json({ ok: true, user }, { headers });
    }
    // 帖子列表（自动清理过期非置顶非星标）
    if (path === "/api/posts" && request.method === "GET") {
      await DB.prepare("DELETE FROM posts WHERE is_star=0 AND is_top=0 AND datetime(expire_at) < datetime('now')").run();
      const { results } = await DB.prepare("SELECT p.*,u.username FROM posts p LEFT JOIN users u ON p.uid=u.id ORDER BY p.is_top DESC, p.created_at DESC").all();
      return Response.json({ ok: true, posts: results }, { headers });
    }
    // 发帖
    if (path === "/api/post/add" && request.method === "POST") {
      const { uid, content, image_url, is_anonymous } = await request.json();
      if (!uid || !content) return Response.json({ ok: false, msg: "内容不能为空" }, { headers });
      const expireAt = new Date();
      expireAt.setMonth(expireAt.getMonth() + 3);
      await DB.prepare("INSERT INTO posts(uid,content,image_url,is_anonymous,expire_at) VALUES(?,?,?,?,?)").bind(uid, content, image_url || "", is_anonymous ? 1 : 0, expireAt.toISOString()).run();
      return Response.json({ ok: true, msg: "发布成功" }, { headers });
    }
    // 删帖
    if (path === "/api/post/delete" && request.method === "POST") {
      const { pid } = await request.json();
      await DB.prepare("DELETE FROM posts WHERE id=?").bind(pid).run();
      return Response.json({ ok: true }, { headers });
    }
    // 置顶
    if (path === "/api/post/top" && request.method === "POST") {
      const { pid, val } = await request.json();
      await DB.prepare("UPDATE posts SET is_top=? WHERE id=?").bind(val ? 1 : 0, pid).run();
      return Response.json({ ok: true }, { headers });
    }
    // 星标
    if (path === "/api/post/star" && request.method === "POST") {
      const { pid, val } = await request.json();
      await DB.prepare("UPDATE posts SET is_star=? WHERE id=?").bind(val ? 1 : 0, pid).run();
      return Response.json({ ok: true }, { headers });
    }
    // 评论（管理员评论自动给帖子作者发提醒）
    if (path === "/api/comment/add" && request.method === "POST") {
      const { post_id, uid, content } = await request.json();
      const post = await DB.prepare("SELECT uid FROM posts WHERE id=?").bind(post_id).first();
      if (!post) return Response.json({ ok: false, msg: "帖子不存在" }, { headers });
      await DB.prepare("INSERT INTO comments(post_id,uid,content) VALUES(?,?,?)").bind(post_id, uid, content).run();
      const commenter = await DB.prepare("SELECT is_admin FROM users WHERE id=?").bind(uid).first();
      if (commenter && commenter.is_admin === 1 && post.uid !== uid) {
        await DB.prepare("INSERT INTO messages(to_uid,content) VALUES(?,?)").bind(post.uid, "管理员回复了你的帖子：" + content.slice(0, 20)).run();
      }
      return Response.json({ ok: true, msg: "评论成功" }, { headers });
    }
    // 获取评论
    if (path === "/api/comments" && request.method === "GET") {
      const post_id = url.searchParams.get("post_id");
      const { results } = await DB.prepare("SELECT c.*,u.username FROM comments c LEFT JOIN users u ON c.uid=u.id WHERE c.post_id=? ORDER BY c.created_at ASC").bind(post_id).all();
      return Response.json({ ok: true, comments: results }, { headers });
    }
    // 获取未读消息
    if (path === "/api/messages/get" && request.method === "GET") {
      const uid = url.searchParams.get("uid");
      const { results } = await DB.prepare("SELECT * FROM messages WHERE to_uid=? AND is_read=0 ORDER BY id DESC").bind(uid).all();
      return Response.json({ ok: true, list: results }, { headers });
    }
    // 标记已读
    if (path === "/api/messages/read" && request.method === "POST") {
      const { uid } = await request.json();
      await DB.prepare("UPDATE messages SET is_read=1 WHERE to_uid=?").bind(uid).run();
      return Response.json({ ok: true }, { headers });
    }
    // 404
    return new Response(JSON.stringify({ok:false,msg:"接口不存在"}),{headers,status:404})
  } catch (e) {
    return Response.json({ ok: false, msg: "服务器错误：" + e.message }, { headers });
  }
}
