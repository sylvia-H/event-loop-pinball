console.log(1);
const p = new Promise((resolve) => {
  console.log(2);
  resolve();
  console.log(3);
});
p.then(() => console.log(4));
console.log(5);
