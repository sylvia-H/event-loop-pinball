async function run() {
  console.log(1);
  await null;
  console.log(2);
}
setTimeout(() => console.log(3), 0);
run();
Promise.resolve().then(() => console.log(4));
console.log(5);
