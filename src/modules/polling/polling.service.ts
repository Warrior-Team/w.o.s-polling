import {DbConnector} from '../db/db-connector';
import axios from 'axios';
import {SocketsManager} from '../sockets-manager/sockets-manager';

export interface IReality {
    warriorReality: number;
    ng: number;
    attackDemands: number;
    operationalPlans: number;
    name: string;
}

export interface IServer {
    id: number;
    name: string;
    url: string;
}

export class PollingService {
    private static realities: IReality[];
    private static servers: IServer[];

    static async init() {
        let realities = await PollingService.getRealities();
        setInterval(async () => {
            for (let reality of realities) {
                let servers = await PollingService.setServers(reality);
                for (let server of servers) {
                    await PollingService.setPoll(server, reality);
                }
            }
        }, 5000);
    }

    static async getRealities() {
        let realitiesData = await DbConnector.query(`SELECT * from realities.realities`);
        this.realities = realitiesData.rows;
        return this.realities;
    }

    static async setServers(reality: IReality) {
        let serversData = await DbConnector.query(`SELECT id, name, url from reality${reality.warriorReality}.servers`);
        this.servers = serversData.rows;
        return this.servers;
    }

    static async setPoll(server: IServer, reality: IReality) {
        try {
            let startTime = Date.now();
            try {
                let response = await axios.get(server.url);
            } catch (error) {
                await this.handleServerDown(reality, server);
                throw new Error(error);
            }
            let endTime = Date.now();
            await this.handleServerUp(reality, server);
            let duration = endTime - startTime;
            console.log(`Polling stage - Reality : ${reality.name}, to Server: ${server.name}`);
            await DbConnector.query(`INSERT INTO reality${reality.warriorReality}.statistics (server_id, request_time, duration_ms) 
                                    values (${server.id},now(),${duration} ) `);
            let updateQuery = `update reality${reality.warriorReality}.servers SET "lastAlive"=now() AT TIME ZONE 'Asia/Jerusalem' where id = ${server.id}`;
            await DbConnector.query(updateQuery);
        } catch (error) {
            console.error(`Error occurred - ${error}`);
        }
    }

    private static async handleServerDown(reality: IReality, server: IServer) {
        let query = `SELECT "isAlive", to_char("lastAlive", 'HH24:MI:SS DD/MM/YYYY') as "lastAlive" from reality${reality.warriorReality}.servers where id = ${server.id}`;
        let livenessData = await DbConnector.query(query);
        let isAlive = livenessData.rows[0].isAlive;
        if (isAlive) {
            SocketsManager.sendMessage({
                type: 'notification',
                server: server.name,
                reality: reality,
                status: 'down'
            });
            console.error(`Polling stage - failed getting answer from ${server.name} in reality ${reality.name}`);
            let updateQuery = `update reality${reality.warriorReality}.servers SET "isAlive"=false where id = ${server.id}`;
            await DbConnector.query(updateQuery);
            SocketsManager.sendMessage({
                type: 'update',
                server: server.name,
                reality: reality,
                data: {id: server.id, isAlive: false, lastAlive: livenessData.rows[0].lastAlive}
            });
        }
    }

    private static async handleServerUp(reality: IReality, server: IServer) {
        let query = `SELECT "isAlive" from reality${reality.warriorReality}.servers where id = ${server.id}`;
        let isAliveData = await DbConnector.query(query);
        let isAlive = isAliveData.rows[0].isAlive;
        if (!isAlive) {
            SocketsManager.sendMessage({
                type: 'notification',
                server: server.name,
                reality: reality,
                status: 'up'
            });
            let updateQuery = `update reality${reality.warriorReality}.servers SET "isAlive"=true where id = ${server.id}`;
            await DbConnector.query(updateQuery);
            SocketsManager.sendMessage({
                type: 'update',
                server: server.name,
                reality: reality,
                data: {id: server.id, isAlive: true}
            });
        }
    }
}
