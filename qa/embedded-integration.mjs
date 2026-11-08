// Supplemental gate: real HTTP/JWT/bcrypt/SQL on embedded PostgreSQL WASM.
// Single-backend multiplexing is NOT native PostgreSQL concurrency evidence.
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const db=await PGlite.create({extensions:{uuid_ossp,pg_trgm,pgcrypto}});
const socket=new PGLiteSocketServer({db,host:'127.0.0.1',port:0,maxConnections:20});
let child;
try {
  await socket.start();
  const address=socket.getServerConn();
  console.log('Supplemental embedded PostgreSQL WASM gate; native database/physical-device gates remain separate.');
  child=spawn(process.execPath,['--unhandled-rejections=strict','qa/connected-launch-integration.cjs'],{
    cwd:root,stdio:'inherit',env:{...process.env,SCENELINK_API_ROOT:root,SCENELINK_TEST_ALLOW_SCHEMA_INIT:'yes',SCENELINK_TEST_ENGINE:'pglite',TEST_DATABASE_URL:`postgresql://postgres@${address}/scenelink_test_embedded`}
  });
  process.exitCode=await new Promise((resolve,reject)=>{child.once('exit',code=>resolve(code??1));child.once('error',reject);});
} finally { await socket.stop();await db.close(); }
