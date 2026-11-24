'use strict';
const {transaction}=require('../launch/shared');

// Every authenticated analytics INSERT must use this boundary. Account deletion
// locks users FOR UPDATE before removing analytics and the account. Holding a
// key-share lock through this INSERT's COMMIT makes both orderings safe: either
// the event commits before deletion cleans it up, or a deleted owner is absent
// and no new identified event is written. An unlocked EXISTS check would race.
function insert(pool,sql,values,userId){
  if(!userId)return pool.query(sql,values);
  return transaction(pool,async db=>{
    const owner=await db.query('SELECT id FROM users WHERE id=$1 FOR KEY SHARE',[userId]);
    if(!owner.rows.length)return{rows:[],rowCount:0};
    return db.query(sql,values);
  });
}

module.exports={insert};
