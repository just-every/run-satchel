-- MATTER-003: matter tasks with owners, priorities, subtasks, dependencies,
-- recurrence, completion evidence, append-only history and in-app notifications.
CREATE TABLE s_tasks(id TEXT PRIMARY KEY, matter_id TEXT NOT NULL REFERENCES s_matters(id), parent_id TEXT REFERENCES s_tasks(id), title TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('low','normal','high','urgent')), due_date TEXT, deadline_id TEXT REFERENCES s_deadlines(id), owner_email TEXT, recurrence TEXT NOT NULL DEFAULT 'none' CHECK(recurrence IN ('none','daily','weekly','monthly')), series_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','done')), completed_by TEXT, completed_at TEXT, completion_evidence TEXT, revision TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, CHECK(deadline_id IS NULL OR due_date IS NULL));
CREATE INDEX s_tasks_matter ON s_tasks(matter_id,status);
CREATE TRIGGER s_task_delete BEFORE DELETE ON s_tasks BEGIN SELECT RAISE(ABORT,'constraint: tasks are history'); END;
CREATE TRIGGER s_task_done_final BEFORE UPDATE ON s_tasks WHEN OLD.status='done' BEGIN SELECT RAISE(ABORT,'constraint: a completed task is final'); END;
CREATE TABLE s_task_dependencies(task_id TEXT NOT NULL REFERENCES s_tasks(id), prerequisite_id TEXT NOT NULL REFERENCES s_tasks(id), PRIMARY KEY(task_id,prerequisite_id), CHECK(task_id<>prerequisite_id));
CREATE TRIGGER s_task_dependency_delete BEFORE DELETE ON s_task_dependencies BEGIN SELECT RAISE(ABORT,'constraint: dependencies are history'); END;
CREATE TABLE s_task_events(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES s_tasks(id), kind TEXT NOT NULL, detail TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL);
CREATE TRIGGER s_task_event_update BEFORE UPDATE ON s_task_events BEGIN SELECT RAISE(ABORT,'constraint: task history is append-only'); END;
CREATE TRIGGER s_task_event_delete BEFORE DELETE ON s_task_events BEGIN SELECT RAISE(ABORT,'constraint: task history is append-only'); END;
CREATE TABLE s_task_notifications(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES s_tasks(id), recipient TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
CREATE INDEX s_task_notifications_recipient ON s_task_notifications(recipient,created_at);
CREATE TRIGGER s_task_notification_update BEFORE UPDATE ON s_task_notifications WHEN NEW.id IS NOT OLD.id OR NEW.task_id IS NOT OLD.task_id OR NEW.recipient IS NOT OLD.recipient OR NEW.message IS NOT OLD.message OR NEW.created_at IS NOT OLD.created_at OR OLD.read_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'constraint: notifications only gain a read time'); END;
