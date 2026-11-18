// Task 26b: Indian plate read out of OCR text boxes. Pure.
import { readPlate } from "../services/sensors/plate";

const box = { x: 0, y: 0, w: 10, h: 10 };

test("reads and normalises a spaced Indian plate", () => {
  expect(readPlate([{ box, value: "DL 8C AB 1234" }])).toBe("DL8CAB1234");
});

test("hyphenated / lower-case plate normalises too", () => {
  expect(readPlate([{ box, value: "mh-12-de-1433" }])).toBe("MH12DE1433");
});

test("non-plate text returns null", () => {
  expect(readPlate([{ box, value: "EXIT" }])).toBeNull();
});

test("first plate among several boxes wins", () => {
  expect(
    readPlate([
      { box, value: "PARKING" },
      { box, value: "KA 05 MJ 9999" },
    ])
  ).toBe("KA05MJ9999");
});
