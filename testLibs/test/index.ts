// name: name
// description: description
// author: @author
// url: test.ts
//@testLibs/hmm
import { subtract } from "../hmm";
import hello from "./hello";
export function add(a: number, b: number): number {
  hello("world");
  return a + b;
}
export function subtractAndAdd(a: number, b: number, c: number): number {
  return add(subtract(a, b), c);
}
