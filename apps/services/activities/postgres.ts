import {Pool} from 'pg';
import type {ActivityRepository,StoredRoom} from './repository';
/** One authoritative Activity process. Room command serialization is owned by the server. */
export class PostgresActivityRepository implements ActivityRepository {
 constructor(private pool:Pool){}
 async initialize(){await this.pool.query('CREATE TABLE IF NOT EXISTS rooms_activity_state (room_id text PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');}
 async load(roomId:string):Promise<StoredRoom|null>{const result=await this.pool.query('SELECT state FROM rooms_activity_state WHERE room_id=$1',[roomId]);return result.rows[0]?.state??null;}
 async save(room:StoredRoom){await this.pool.query('INSERT INTO rooms_activity_state(room_id,state) VALUES($1,$2) ON CONFLICT(room_id) DO UPDATE SET state=EXCLUDED.state, updated_at=now()',[room.snapshot.roomId,JSON.stringify(room)]);}
 async list():Promise<StoredRoom[]>{return(await this.pool.query('SELECT state FROM rooms_activity_state')).rows.map(row=>row.state);}
}
