import { randomBytes, scrypt } from "node:crypto";

const KEY_LENGTH = 64;
const N = 16_384;
const R = 8;
const P = 1;

function derive(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N, r: R, p: P, maxmem: 128 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

function readHidden(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error("対話形式のターミナルで実行してください。");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    const onData = (data) => {
      for (const character of data) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("中断しました。"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += character;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", onData);
  });
}

try {
  const password = await readHidden("新しいパスワード（12文字以上）: ");
  const confirmation = await readHidden("確認のため再入力: ");
  if (password.length < 12)
    throw new Error("パスワードは12文字以上にしてください。");
  if (password !== confirmation)
    throw new Error("入力したパスワードが一致しません。");

  const salt = randomBytes(16);
  const key = await derive(password, salt);
  const encoded = [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");

  console.log("\nAUTH_PASSWORD_HASH に次の値を設定してください:\n");
  console.log(encoded);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
