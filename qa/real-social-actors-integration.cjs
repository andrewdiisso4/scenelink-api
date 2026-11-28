'use strict';
// Runs only inside the guarded fresh localhost integration database. These are
// fictional rows for testing the historical fixture policy, never production data.
const assert=require('node:assert/strict');
module.exports=async function realSocialActorsIntegration({api,pool,check,crypto,req}){
  const suffix=crypto.randomBytes(3).toString('hex'),hidden=[],ordinary=[];
  async function account(email,label){
    const user=(await pool.query(`INSERT INTO users(email,username,display_name,is_private,discoverable,allow_messages,email_verified_at,verified_email)
      VALUES($1::text,$2,$3,false,true,'everyone',NOW(),lower($1::text)) RETURNING id,email,username,auth_version`,[email,'rg_'+label.slice(0,12)+'_'+suffix,'QA demo '+label+' '+suffix])).rows[0];
    return{user,token:req('./src/middleware/auth').generateToken(user)};
  }
  const viewer=await account('viewer.'+suffix+'@example.invalid','viewer'),venue=crypto.randomUUID();
  await check('consumer discovery excludes exact source fixtures without broad name or email heuristics',async()=>{
    for(const [label,email] of [
      ['demo','DeMo@SceneLink.App'],['reviewer','reviewer@scenelink.app'],['companion','reviewer-friend@scenelink.app'],
      ['seed','seed_reviewer_'+suffix+'@scenelink.app'],['seed_case','SEED_REVIEWER_CASE_'+suffix+'@SCENELINK.APP'],
      ['smoke','qa9a_a_1700000000000@scenelink.test'],['browser','qa9e_b_1700000000000@scenelink.test']
    ])hidden.push(await account(email,label));
    for(const [label,email] of [
      ['ordinary','ordinary.'+suffix+'@example.invalid'],['literal_underscores','seedXreviewerY'+suffix+'@scenelink.app'],
      ['literal_domain','seed_reviewer_'+suffix+'@scenelinkXapp'],['similar_address','reviewer+'+suffix+'@scenelink.app'],
      ['same_domain','ordinary.'+suffix+'@scenelink.test'],['different_tag','qa9a_c_1700000000000@scenelink.test'],
      ['different_suffix','qa9e_a_1700000000000x@scenelink.test'],['local_smoke','qa9a_a_1700000000000@example.invalid']
    ])ordinary.push(await account(email,label));
    for(const fixture of hidden){
      assert.deepEqual((await api('GET','/users/search?q='+fixture.user.username,undefined,viewer.token)).results,[]);
      assert.deepEqual((await api('GET','/search/universal?q='+fixture.user.username,undefined,viewer.token)).users,[]);
      await api('GET','/users/'+fixture.user.id,undefined,viewer.token,404);
      await api('GET','/users/'+fixture.user.username,undefined,null,404);
      assert.equal((await api('GET','/users/me',undefined,fixture.token)).user.id,fixture.user.id);
      assert.equal((await api('PATCH','/users/me/settings',{share_read_receipts:false},fixture.token)).settings.share_read_receipts,false);
    }
    const suggestions=(await api('GET','/users/suggestions?limit=30',undefined,viewer.token)).suggestions;
    for(const peer of ordinary){
      assert.equal((await api('GET','/users/search?q='+peer.user.username,undefined,viewer.token)).results[0].id,peer.user.id);
      assert.equal((await api('GET','/search/universal?q='+peer.user.username,undefined,viewer.token)).users[0].id,peer.user.id);
      assert.equal((await api('GET','/users/'+peer.user.id)).user.id,peer.user.id);
      assert(suggestions.some(u=>u.id===peer.user.id),'Similar addresses and QA/demo names stay discoverable');
    }
    assert(suggestions.every(u=>!hidden.some(h=>h.user.id===u.id)));
  });
  await check('direct-ID friendship and conversation creation cannot bypass fixture visibility',async()=>{
    for(const fixture of hidden){
      await api('POST','/friends/request',{user_id:fixture.user.id},viewer.token,404);
      await api('POST','/friends/request',{username:fixture.user.username},viewer.token,404);
      await api('POST','/friends/request',{user_id:viewer.user.id},fixture.token,404);
      await api('POST','/conversations',{user_id:fixture.user.id},viewer.token,404);
    }
    const real=await api('POST','/friends/request',{user_id:ordinary[0].user.id},viewer.token);
    await api('POST','/friends/accept',{friendship_id:real.friendship_id},ordinary[0].token);
    for(const [fixture,status] of [[hidden[0],'accepted'],[hidden[1],'pending']]){
      await pool.query(`INSERT INTO friendships(user_a_id,user_b_id,requester_id,status)
        VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid),$2,$3)`,[viewer.user.id,fixture.user.id,status]);
    }
    assert.deepEqual((await api('GET','/friends',undefined,viewer.token)).friends.map(u=>u.id),[ordinary[0].user.id]);
    assert.deepEqual((await api('GET','/friends/pending',undefined,viewer.token)).incoming,[]);
    const summary=await api('GET','/social/summary',undefined,viewer.token);
    assert.equal(summary.friends,1);assert.equal(summary.pending_friend_requests,0);
    assert.equal((await api('GET','/users/'+viewer.user.id,undefined,viewer.token)).user.friend_count,1);
  });
  await check('feed, profile posts and venue activity expose persisted eligible authors only',async()=>{
    await pool.query("INSERT INTO venues(id,name,slug,type,is_active) VALUES($1,'Fictional social policy venue',$2,'cafe',true)",[venue,'social-policy-'+suffix]);
    for(const author of [...hidden,...ordinary]){
      author.post=crypto.randomUUID();
      await pool.query("INSERT INTO posts(id,user_id,body,audience,is_public) VALUES($1,$2,'Historical policy fixture post','public',true)",[author.post,author.user.id]);
      await pool.query("INSERT INTO checkins(user_id,venue_id,note,audience) VALUES($1,$2,'Historical policy fixture check-in','public')",[author.user.id,venue]);
      await pool.query("INSERT INTO reviews(user_id,venue_id,rating,content) VALUES($1,$2,4,'Historical policy fixture review')",[author.user.id,venue]);
    }
    for(const fixture of hidden){
      for(const token of [null,viewer.token]){
        assert.deepEqual((await api('GET','/posts/feed?user_id='+fixture.user.id,undefined,token)).items,[]);
        assert.deepEqual((await api('GET','/posts?user_id='+fixture.user.id,undefined,token)).posts,[]);
        await api('GET','/posts/'+fixture.post,undefined,token,404);
      }
    }
    for(const peer of ordinary){
      const feed=(await api('GET','/posts/feed?user_id='+peer.user.id,undefined,viewer.token)).items;
      assert.deepEqual(feed.map(x=>x.kind).sort(),['checkin','post','review']);
      assert.equal((await api('GET','/posts/'+peer.post,undefined,viewer.token)).post.id,peer.post);
    }
    const expected=ordinary.map(a=>a.user.id).sort();
    for(const token of [null,viewer.token]){
      assert.deepEqual((await api('GET','/reviews?venue_id='+venue,undefined,token)).reviews.map(r=>r.user_id).sort(),expected);
      assert.deepEqual((await api('GET','/venues/'+venue+'/activity',undefined,token)).checkins.map(r=>r.user_id).sort(),expected);
    }
    const friends=(await api('GET','/posts/feed?scope=friends',undefined,viewer.token)).items;
    assert.equal(friends.length,3);assert(friends.every(p=>p.user_id===ordinary[0].user.id));
  });
  await check('engagement counts agree with visible comments and exclude fixtures, blocks and inactive authors',async()=>{
    const blocked=await account('blocked.'+suffix+'@example.invalid','blocked');
    const suspended=await account('suspended.'+suffix+'@example.invalid','suspended');
    const inactive=await account('inactive.'+suffix+'@example.invalid','inactive');
    await api('POST','/users/'+blocked.user.id+'/block',{},viewer.token,201);
    await pool.query('UPDATE users SET is_suspended=true WHERE id=$1',[suspended.user.id]);
    await pool.query('UPDATE users SET is_active=false WHERE id=$1',[inactive.user.id]);
    for(const actor of [ordinary[1],hidden[0],blocked,suspended,inactive]){
      await pool.query('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2)',[ordinary[0].post,actor.user.id]);
      await pool.query("INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,'Historical policy fixture comment')",[ordinary[0].post,actor.user.id]);
    }
    // Cached historical totals must not override viewer-specific live counts.
    await pool.query('UPDATE posts SET like_count=99,comment_count=99 WHERE id=$1',[ordinary[0].post]);
    const detail=(await api('GET','/posts/'+ordinary[0].post,undefined,viewer.token)).post;
    assert.equal(detail.like_count,1);assert.equal(detail.comment_count,1);
    const feed=(await api('GET','/posts?user_id='+ordinary[0].user.id,undefined,viewer.token)).posts[0];
    assert.equal(feed.like_count,1);assert.equal(feed.comment_count,1);
    assert.deepEqual((await api('GET','/posts/'+ordinary[0].post+'/comments',undefined,viewer.token)).comments.map(c=>c.user_id),[ordinary[1].user.id]);
    const publicPost=(await api('GET','/posts/'+ordinary[0].post)).post;
    assert.equal(publicPost.like_count,2);assert.equal(publicPost.comment_count,2);
    for(let i=0;i<2;i++)assert.equal((await api('PUT','/posts/'+ordinary[0].post+'/like',{liked:true},viewer.token)).like_count,2);
    const created=await api('POST','/posts/'+ordinary[0].post+'/comments',{body:'Local eligible comment',client_id:crypto.randomUUID()},viewer.token,201);
    assert.equal(created.comment_count,2);
    assert.equal((await api('DELETE','/posts/'+ordinary[0].post+'/comments/'+created.comment.id,undefined,viewer.token)).comment_count,1);
  });
  await check('fixture sessions cannot create new feed activity or engagement while account controls remain usable',async()=>{
    const fixture=hidden[0],pid=ordinary[0].post;
    const counts=async()=>(await pool.query(`SELECT
      (SELECT count(*)::int FROM posts WHERE user_id=$1) AS posts,
      (SELECT count(*)::int FROM checkins WHERE user_id=$1) AS checkins,
      (SELECT count(*)::int FROM post_likes WHERE user_id=$1) AS likes,
      (SELECT count(*)::int FROM post_comments WHERE user_id=$1) AS comments`,[fixture.user.id])).rows[0];
    const before=await counts();
    await api('POST','/posts',{body:'Must not create activity',audience:'public',client_id:crypto.randomUUID()},fixture.token,403);
    await api('POST','/checkins',{venue_id:venue,audience:'public',client_id:crypto.randomUUID()},fixture.token,403);
    await api('PUT','/posts/'+pid+'/like',{liked:false},fixture.token,403);
    await api('POST','/posts/'+pid+'/comments',{body:'Must not create engagement',client_id:crypto.randomUUID()},fixture.token,403);
    assert.deepEqual(await counts(),before);
    assert.equal((await api('GET','/users/me',undefined,fixture.token)).user.id,fixture.user.id);
    await api('PATCH','/users/me/settings',{discoverable:false},fixture.token);
  });
  await check('fixture notifications do not inflate public social summaries',async()=>{
    const before=(await api('GET','/social/summary',undefined,viewer.token)).unread_notifications;
    await pool.query("INSERT INTO notifications(user_id,actor_id,type,ref_type,ref_id) VALUES($1,$2,'post_like','post',$3)",[viewer.user.id,hidden[0].user.id,ordinary[0].post]);
    assert.equal((await api('GET','/social/summary',undefined,viewer.token)).unread_notifications,before);
    assert((await api('GET','/notifications',undefined,viewer.token)).notifications.every(n=>!hidden.some(h=>h.user.id===n.actor_id)));
  });
};
