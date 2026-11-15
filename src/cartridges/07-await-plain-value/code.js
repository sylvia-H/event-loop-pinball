async function f() {
  console.log(1);
  await 42;
  console.log(2);
}
f();
Promise.resolve().then(() => console.log(3));
console.log(4);
