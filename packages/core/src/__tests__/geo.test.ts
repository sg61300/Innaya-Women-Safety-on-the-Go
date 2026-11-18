import { haversineM, distanceToPolylineM } from "../geo";
const A = { lat: 28.6139, lng: 77.2090 }, B = { lat: 28.6239, lng: 77.2090 };   // ~1.11 km north
test("haversine", () => { expect(haversineM(A, A)).toBe(0); expect(haversineM(A, B)).toBeGreaterThan(1100); expect(haversineM(A, B)).toBeLessThan(1125); });
test("distance to polyline: on the line = 0, beside it = perpendicular distance", () => {
  const line = [A, B];
  expect(distanceToPolylineM({ lat: 28.6189, lng: 77.2090 }, line)).toBeLessThan(1);
  const beside = distanceToPolylineM({ lat: 28.6189, lng: 77.2120 }, line);       // ~0.003° lng ≈ 293 m at this latitude
  expect(beside).toBeGreaterThan(280); expect(beside).toBeLessThan(305);
  expect(distanceToPolylineM(A, [])).toBe(Infinity);
});
