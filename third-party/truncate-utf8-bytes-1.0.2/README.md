# Restored upstream notice

The npm archive of truncate-utf8-bytes1.0.2 declares WTFPL and includes AUTHORS but omits a full license file. Its v1.0.2 Git tag also omits that file. The upstream repository later added LICENSE.WTFPL.txt; this directory preserves that original file without modification from commit `4212839ea184e74fb81f1e4e633e1db794ebe4f4`:

[Original upstream license](https://github.com/parshap/truncate-utf8-bytes/blob/4212839ea184e74fb81f1e4e633e1db794ebe4f4/LICENSE.WTFPL.txt)

All three runtime source files in npm1.0.2 were compared byte-for-byte against that commit and are identical:

| File | SHA-256 |
| --- | --- |
| index.js | 2b73a25f485d18cdfb4c02d4776d8f16e137891ddfba5eebc9191a4f23030ff7 |
| browser.js | c6d1350a61d9d64c5d4eb02840438b7d5659c18a1be4c2daf130125d85621dcd |
| lib/truncate.js | 2593c60c726ba7d77baa57149b25c8a44c238e68b3642c0beb56207d4bba144a |

The build adds this notice alongside the unchanged packaged code and its original AUTHORS. It does not alter the package's declared license or invent a notice for nodejs-file-downloader, whose missing full upstream notice remains separately flagged.
