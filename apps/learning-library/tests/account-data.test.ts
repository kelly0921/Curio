import { describe, expect, it, vi } from "vitest";
import { deleteProfileData, deleteProfileObjects } from "@/lib/account/data";

const profileId = "00000000-0000-4000-8000-000000000077";

describe("account deletion boundaries", () => {
  it("binds every D1 deletion to the authenticated profile", async () => {
    const statements: { query: string; values: unknown[] }[] = [];
    const database = {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            const statement = { query, values };
            statements.push(statement);
            return statement;
          },
        };
      },
      async batch(inputs: unknown[]) {
        return inputs.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;

    await expect(deleteProfileData(database, profileId)).resolves.toBe(5);
    expect(statements).toHaveLength(5);
    expect(statements.every((statement) => statement.values.length === 1 && statement.values[0] === profileId)).toBe(true);
    expect(statements.every((statement) => /WHERE profile_id = \?/u.test(statement.query))).toBe(true);
  });

  it("deletes only R2 objects inside the authenticated profile prefix", async () => {
    const remove = vi.fn(async () => undefined);
    const list = vi.fn(async () => ({
      objects: [
        { key: `profiles/${profileId}/items/item-a/cover.jpg` },
        { key: "profiles/another-user/items/item-b/cover.jpg" },
      ],
      truncated: false,
    }));
    const bucket = { list, delete: remove } as unknown as R2Bucket;

    await expect(deleteProfileObjects(bucket, profileId)).resolves.toBe(1);
    expect(list).toHaveBeenCalledWith({ prefix: `profiles/${profileId}/`, cursor: undefined, limit: 1_000 });
    expect(remove).toHaveBeenCalledWith([`profiles/${profileId}/items/item-a/cover.jpg`]);
  });
});
