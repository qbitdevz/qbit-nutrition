// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import m0000 from './20261121135329_init/migration.sql';
import m0001 from './20261121140136_goal_one_current/migration.sql';
import m0002 from './20261122113137_imported_foods/migration.sql';
import m0003 from './20261122142157_collection_content_hash/migration.sql';

  export default {
    migrations: {
      "20261121135329_init": m0000,
"20261121140136_goal_one_current": m0001,
"20261122113137_imported_foods": m0002,
"20261122142157_collection_content_hash": m0003
}
  }
  