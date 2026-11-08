import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { parseTaskLinkCommand, parseTaskQuery, type MarketingTaskLink, type TaskSummary } from "@/lib/marketing/task-links-domain";
import { databaseError, marketingErrorResponse, marketingResponse, readBoundedJson } from "@/lib/marketing/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const taskColumns = "id,title,status,owner_id,deadline,version";
async function requireContent(client: SupabaseClient, id: string) {
  const { data, error } = await client.from("marketing_content_items").select("id,team_id").eq("id", id).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new MarketingError("Nội dung không có trong phạm vi truy cập.", 404, "not_found");
}
function taskSummary(row: TaskSummary): TaskSummary {
  return { id: row.id, title: row.title, status: row.status, owner_id: row.owner_id, deadline: row.deadline, version: row.version };
}

export async function GET(request: Request) {
  try {
    const { client } = await getDashboardRequestIdentity(request);
    const query = parseTaskQuery(new URL(request.url).searchParams);
    await requireContent(client, query.contentId);
    if (query.taskId) {
      const [{ data: task, error: taskError }, { data: link, error: linkError }] = await Promise.all([
        client.from("tasks").select(taskColumns).eq("id", query.taskId).is("deleted_at", null).maybeSingle(),
        client.from("marketing_task_links").select("version").eq("content_id", query.contentId).eq("task_id", query.taskId).maybeSingle(),
      ]);
      if (taskError) databaseError(taskError);
      if (linkError) databaseError(linkError);
      if (!task) throw new MarketingError("Task không có trong phạm vi truy cập hoặc đã được xóa.", 404, "not_found");
      await requireContent(client, query.contentId);
      return marketingResponse({ lookup: { task: taskSummary(task), expected_link_version: link?.version ?? 0 } });
    }
    const { data: rows, error, count } = await client.from("marketing_task_links").select("*", { count: "exact" })
      .eq("content_id", query.contentId).eq("enabled", true).order("created_at", { ascending: false }).range(0, 20);
    if (error) databaseError(error);
    if ((count ?? rows?.length ?? 0) > 20) throw new MarketingError("Nội dung vượt giới hạn tải liên kết Task.", 503, "capacity_limit");
    const links = (rows ?? []) as MarketingTaskLink[];
    const tasks = new Map<string, TaskSummary>();
    if (links.length) {
      const { data, error: taskError } = await client.from("tasks").select(taskColumns).in("id", links.map((link) => link.task_id)).is("deleted_at", null);
      if (taskError) databaseError(taskError);
      for (const task of data ?? []) tasks.set(task.id, taskSummary(task));
    }
    await requireContent(client, query.contentId);
    return marketingResponse({ links: links.map((link) => ({ ...link, task: tasks.get(link.task_id) ?? null })) });
  } catch (error) { return marketingErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { client, profile } = await getDashboardRequestIdentity(request);
    if (!profile.roles.some((role) => ["Admin", "PR Leader", "PR Representative"].includes(role))) {
      throw new MarketingError("Viewer chỉ có quyền xem Task liên kết.", 403, "forbidden");
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new MarketingError("Nguồn yêu cầu không hợp lệ.", 403, "forbidden");
    const command = parseTaskLinkCommand(await readBoundedJson(request));
    const { data, error } = await client.rpc("marketing_task_command", { p_command: command });
    if (error) databaseError(error);
    return marketingResponse({ result: data });
  } catch (error) { return marketingErrorResponse(error); }
}
