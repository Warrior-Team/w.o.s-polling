import {Pool, QueryResult} from "pg";

export class DbConnector {
    private static pool: Pool;

    static init() {
        this.pool = new Pool({
            user: 'shame_usr@galileo-dbs',
            host: 'galileo-dbs.postgres.database.azure.com',
            database: 'shame_db',
            password: 'vgserd3242',
            port: 5432
        })
    }

    static async query(query: string, variables?: any[]): Promise<QueryResult> {
        return this.pool.query(query, variables)
    }
}
