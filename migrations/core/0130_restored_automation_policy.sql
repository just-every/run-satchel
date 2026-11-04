-- The archive policy normalizes this bootstrap row in the atomic import itself,
-- including imports through the installation recovery command.
CREATE TABLE s_recovery_state(
 id INTEGER PRIMARY KEY CHECK(id=1),
 sending_paused INTEGER NOT NULL DEFAULT 0 CHECK(sending_paused IN(0,1)),
 charging_paused INTEGER NOT NULL DEFAULT 0 CHECK(charging_paused IN(0,1))
);
INSERT INTO s_recovery_state VALUES(1,0,0);
