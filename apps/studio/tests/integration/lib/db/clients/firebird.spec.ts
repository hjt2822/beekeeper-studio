import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { IDbConnectionServerConfig } from "@/lib/db/types";
import { DBTestUtil, dbtimeout, Options } from "../../../../lib/db";
import { runCommonTests } from "./all";
import {
  Connection,
  createDatabase,
  Pool,
} from "@/lib/db/clients/firebird/NodeFirebirdWrapper";
import Firebird from "node-firebird";

describe("Firebird Tests", () => {
  let container: StartedTestContainer;
  let util: DBTestUtil;

  beforeAll(async () => {
    const timeoutDefault = 5000;
    jest.setTimeout(dbtimeout);

    container = await new GenericContainer("jacobalberty/firebird:v4.0.1")
      .withName("test_firebird")
      .withEnv("ISC_PASSWORD", "masterkey")
      .withEnv("FIREBIRD_DATABASE", "defaultdb.fdb")
      .withEnv("EnableLegacyClientAuth", "true")
      .withExposedPorts(3050)
      .withWaitStrategy(Wait.forHealthCheck())
      .withHealthCheck({
        /* eslint-disable-next-line */
        test: `(echo "select 1 as a from rdb\$database;" | /usr/local/firebird/bin/isql -user sysdba -password masterkey /firebird/data/sakila.fdb) || exit 1`,
        interval: 2000,
        timeout: 3000,
        retries: 10,
        startPeriod: 5000,
      })
      .withStartupTimeout(dbtimeout)
      .start();

    jest.setTimeout(timeoutDefault);

    const config: IDbConnectionServerConfig = {
      client: "firebird",
      host: container.getHost(),
      port: container.getMappedPort(3050),
      user: "sysdba",
      password: "masterkey",
      osUser: null,
      ssh: null,
      sslCaFile: null,
      sslCertFile: null,
      sslKeyFile: null,
      sslRejectUnauthorized: false,
      ssl: false,
      domain: null,
      socketPath: null,
      socketPathEnabled: false,
      readOnlyMode: false
    };
    const options: Options = {
      dialect: "firebird",
      skipPkQuote: true,
      skipGeneratedColumns: true,
      knexConnectionOptions: {
        lowercase_keys: true,
      },
    };
    const database = "/firebird/data/defaultdb.fdb";

    util = new DBTestUtil(config, database, options);

    await util.setupdb();
  });

  afterAll(async () => {
    if (util.connection) {
      await util.connection.disconnect();
    }
    if (container) {
      await container.stop();
    }
  });

  describe("Common Tests", () => {
    runCommonTests(() => util);
  });

  describe("NodeFirebirdWrapper", () => {
    let config: Firebird.Options;

    beforeAll(() => {
      config = {
        host: container.getHost(),
        port: container.getMappedPort(3050),
        user: "sysdba",
        password: "masterkey",
        database: "/firebird/data/firebird-wrapper-test.fdb",
      };
    });

    it("can create a new database", async () => {
      await createDatabase(config);
      expect(true).toBe(true);
    });

    it("should query using Connection", async () => {
      const connection = await Connection.attach(config);

      await connection.query(`
        create table objects (
          id integer generated by default as identity primary key,
          name varchar(15)
        );
      `);

      await connection.query("insert into objects (name) values ('test')");

      let result = await connection.query("select * from objects");
      expect(result.rows).toStrictEqual([{ ID: 1, NAME: "test" }]);
      expect(result.meta.length).toBe(2); // meta is an array of column info

      result = await connection.query("select * from objects where ID = ?", [
        1,
      ]);
      expect(result.rows).toStrictEqual([{ ID: 1, NAME: "test" }]);

      result = await connection.query(
        "select * from objects where ID = ?",
        [1],
        true
      );
      expect(result.rows).toStrictEqual([[1, "test"]]);
    });

    it("should query using Pool", async () => {
      const pool = new Pool(config);
      const result = await pool.query("select 1 as a from rdb$database");
      expect(result.rows).toStrictEqual([{ A: 1 }]);
    });
  });

  it("should fetch routines correctly", async () => {
    const routines = await util.connection.listRoutines();
    expect(routines[0]).toMatchObject({
      id: "1",
      name: "TRANSITIONS",
      type: "procedure",
      entityType: "routine",
      routineParams: [
        { name: "RDB$TIME_ZONE_NAME", type: "in" },
        { name: "RDB$FROM_TIMESTAMP", type: "in" },
        { name: "RDB$TO_TIMESTAMP", type: "in" },
        { name: "RDB$START_TIMESTAMP", type: "out" },
        { name: "RDB$END_TIMESTAMP", type: "out" },
        { name: "RDB$ZONE_OFFSET", type: "out" },
        { name: "RDB$DST_OFFSET", type: "out" },
        { name: "RDB$EFFECTIVE_OFFSET", type: "out" },
      ],
    });
    expect(routines[1]).toMatchObject({
      id: "1",
      name: "DATABASE_VERSION",
      type: "function",
      returnType: "VARCHAR",
      entityType: "routine",
      routineParams: [],
    });
  });

  // https://github.com/beekeeper-studio/beekeeper-studio/issues/2036
  it("should return correct data after applying changes", async () => {
    const queries = [
      // Domain creation
      `CREATE DOMAIN RATING AS VARCHAR(5)
        CHECK (VALUE IS NULL OR VALUE IN ('G', 'PG', 'PG-13', 'R', 'NC-17'));`,
      `CREATE DOMAIN YEARONLY AS INT
        CHECK (VALUE >= 1901 AND VALUE <= 2155);`,
      `CREATE DOMAIN SPECIAL_FEATURES AS VARCHAR(100)
        CHECK (VALUE IS NULL OR
               VALUE LIKE 'Trailers' OR
               VALUE LIKE 'Trailers,%' OR
               VALUE LIKE '%,Trailers,%' OR
               VALUE LIKE '%,Trailers' OR
               VALUE LIKE 'Commentaries' OR
               VALUE LIKE 'Commentaries,%' OR
               VALUE LIKE '%,Commentaries,%' OR
               VALUE LIKE '%,Commentaries' OR
               VALUE LIKE 'Deleted Scenes' OR
               VALUE LIKE 'Deleted Scenes,%' OR
               VALUE LIKE '%,Deleted Scenes,%' OR
               VALUE LIKE '%,Deleted Scenes' OR
               VALUE LIKE 'Behind the Scenes' OR
               VALUE LIKE 'Behind the Scenes,%' OR
               VALUE LIKE '%,Behind the Scenes,%' OR
               VALUE LIKE '%,Behind the Scenes');`,

      // Table creation
      `CREATE TABLE film (
        film_id INT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
        title VARCHAR(255) NOT NULL,
        description BLOB SUB_TYPE TEXT DEFAULT NULL,
        release_year YEARONLY DEFAULT NULL,

        language_id INT NOT NULL,
        original_language_id INT DEFAULT NULL,

        rental_duration SMALLINT  DEFAULT 3 NOT NULL,
        rental_rate DECIMAL(4,2) DEFAULT 4.99 NOT NULL,
        length SMALLINT DEFAULT NULL,

        replacement_cost DECIMAL(5,2) DEFAULT 19.99 NOT NULL,
        rating RATING DEFAULT 'G',
        special_features SPECIAL_FEATURES DEFAULT NULL, -- Firebird does not support MySQL-like SET types, we must emulate this
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (film_id)
      );`,

      // Data insertion
      `INSERT INTO film VALUES (1,'ACADEMY DINOSAUR','A Epic Drama of a Feminist And a Mad Scientist who must Battle a Teacher in The Canadian Rockies',2006,1,NULL,6,'0.99',86,'20.99','PG','Deleted Scenes,Behind the Scenes','2006-02-15 05:03:42');`,
    ];
    for (const query of queries) {
      await util.knex.raw(query);
    }
    const result = await util.connection.applyChanges({
      inserts: [],
      updates: [
        {
          table: "film",
          column: "title",
          primaryKeys: [{ column: "film_id", value: 1 }],
          value: "ACADEMY DINOSAUR 2",
        },
      ],
      deletes: [],
    });
    expect(result[0]).toMatchObject({
      FILM_ID: 1,
      TITLE: 'ACADEMY DINOSAUR 2',
      DESCRIPTION: 'A Epic Drama of a Feminist And a Mad Scientist who must Battle a Teacher in The Canadian Rockies',
      RELEASE_YEAR: 2006,
      LANGUAGE_ID: 1,
      ORIGINAL_LANGUAGE_ID: null,
      RENTAL_DURATION: 6,
      RENTAL_RATE: 0.99,
      LENGTH: 86,
      REPLACEMENT_COST: 20.99,
      RATING: 'PG',
      SPECIAL_FEATURES: 'Deleted Scenes,Behind the Scenes',
      LAST_UPDATE: new Date('2006-02-14T22:03:42.000Z'),
    })
  });
});
