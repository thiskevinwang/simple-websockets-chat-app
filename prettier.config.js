module.exports = {
  printWidth: 80,
  tabWidth: 2,
  trailingComma: "all",
  singleQuote: false,
  semi: true,
  importOrder: [
    // node stdlib
    "^(path|fs|child_process|os)$",
    // aws sdk v3
    "^@aws-sdk",
    // next/react/swr'
    // "^(next|swr|react)(.*)$",
    // node_modules
    "<THIRD_PARTY_MODULES>",
    "^[./]",
  ],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};
