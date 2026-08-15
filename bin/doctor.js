#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err.stack || err.message);
    process.exitCode = 2;
  }
);
