function outer() {
  setTimeout(() => console.log(1), 0);
  setImmediate(() => console.log(2));
  console.log(3);
}
setTimeout(outer, 0);
