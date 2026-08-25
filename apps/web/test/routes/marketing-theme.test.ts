import { expect, test } from "bun:test"

import { Route } from "../../src/routes/_marketing"

test("marketing pages advertise their dark browser canvas", () => {
  const head = Route.options.head?.({} as never)

  expect(head?.meta).toContainEqual({
    name: "theme-color",
    content: "#101113",
  })
})
