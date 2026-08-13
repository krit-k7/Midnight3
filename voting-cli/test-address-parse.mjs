import { MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';

const preprodShielded = 'mn_shield-addr_preprod1n6720uekpasnqcfm8pdhpnv2dulsv44w90c74dsweftlskr39csrd86dsksm8zw3pzx6zj9vp35j42hsgmdgh7tfunzn7vvyz0062vsr8luef';
const preprodUnshielded = 'mn_addr_preprod1ztzdv2msrhlrn303yrl0xfzxtg7hx8qckncafwdhxmtek8c7lxvqtq67rc';

const previewShielded = 'mn_shield-addr_preview1n6720uekpasnqcfm8pdhpnv2dulsv44w90c74dsweftlskr39csrd86dsksm8zw3pzx6zj9vp35j42hsgmdgh7tfunzn7vvyz0062vsu2h55m';
const previewUnshielded = 'mn_addr_preview1ztzdv2msrhlrn303yrl0xfzxtg7hx8qckncafwdhxmtek8c7lxvqtpyws9';

const testAddress = (name, addr) => {
  try {
    const parsed = MidnightBech32m.parse(addr);
    console.log(`[OK] ${name}: type=${parsed.type}, network=${parsed.network}, bytes=${parsed.data.length}`);
  } catch (e) {
    console.log(`[ERR] ${name}: ${e.message}`);
  }
};

console.log('--- Testing Address Parser ---');
testAddress('Preprod Shielded', preprodShielded);
testAddress('Preprod Unshielded', preprodUnshielded);
testAddress('Preview Shielded', previewShielded);
testAddress('Preview Unshielded', previewUnshielded);
