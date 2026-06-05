// Domain Validation Test Script
// Tests the validation logic from custom-domain.service.ts

function normalizeDomain(domain) {
    return domain.toLowerCase().trim().replace(/\.$/, '');
}

function isValidDomain(domain) {
    if (!domain || domain.length < 4 || domain.length > 253) return false;
    if (domain.includes(' ') || domain.includes('/') || domain.includes(':')) return false;
    if (!domain.includes('.')) return false;
    
    const labels = domain.split('.');
    if (labels.length < 2) return false;
    
    for (const label of labels) {
        if (!label || label.length > 63) return false;
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label)) return false;
    }
    
    return true;
}

function isIPAddress(domain) {
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const ipv6Regex = /^\[?[0-9a-fA-F:]+\]?$/;
    return ipv4Regex.test(domain) || ipv6Regex.test(domain);
}

function isSystemDomain(domain) {
    const defaultDomain = 'agentmail.io'; // mock for testing
    if (defaultDomain && domain.toLowerCase() === defaultDomain.toLowerCase()) {
        return true;
    }
    
    const reservedDomains = [
        'agentmail.io',
        'agentmail.com',
        'agentmail.to',
    ];
    
    return reservedDomains.some(
        (reserved) => domain.toLowerCase() === reserved.toLowerCase()
    );
}

// Test cases
const testCases = [
    // Valid domains
    { domain: 'example.com', expected: true, type: 'valid' },
    { domain: 'sub.example.com', expected: true, type: 'valid' },
    { domain: 'my-domain.org', expected: true, type: 'valid' },
    { domain: 'a.co', expected: true, type: 'valid' },
    { domain: 'xn--nxasmq5a.com', expected: true, type: 'valid' },
    
    // Invalid format
    { domain: '', expected: false, type: 'invalid-empty' },
    { domain: 'example', expected: false, type: 'invalid-no-tld' },
    { domain: '.com', expected: false, type: 'invalid-dot-com' },
    { domain: 'example.', expected: false, type: 'invalid-trailing-dot' },
    { domain: 'example..com', expected: false, type: 'invalid-double-dot' },
    { domain: 'example .com', expected: false, type: 'invalid-space' },
    { domain: 'example.com/path', expected: false, type: 'invalid-path' },
    { domain: 'https://example.com', expected: false, type: 'invalid-protocol' },
    { domain: 'example.com:8080', expected: false, type: 'invalid-port' },
    { domain: '-example.com', expected: false, type: 'invalid-leading-dash' },
    { domain: 'example-.com', expected: false, type: 'invalid-trailing-dash' },
    { domain: 'exam ple.com', expected: false, type: 'invalid-space' },
    { domain: 'exa_mple.com', expected: false, type: 'invalid-underscore' },
    
    // IP addresses
    { domain: '192.168.1.1', expected: false, type: 'invalid-ip' },
    { domain: '10.0.0.1', expected: false, type: 'invalid-ip' },
    
    // System/reserved
    { domain: 'agentmail.io', expected: false, type: 'invalid-reserved' },
    { domain: 'agentmail.com', expected: false, type: 'invalid-reserved' },
    
    // Edge cases
    { domain: 'a', expected: false, type: 'invalid-too-short' },
    { domain: 'a.b', expected: false, type: 'invalid-too-short' },
    { domain: '123.456.789.012', expected: false, type: 'invalid-ip-like' },
];

console.log('Running Domain Validation Tests...\n');
let passed = 0;
let failed = 0;

testCases.forEach(({ domain, expected, type }) => {
    const normalized = normalizeDomain(domain);
    let result;
    
    if (isIPAddress(normalized)) {
        result = false;
    } else if (isSystemDomain(normalized)) {
        result = false;
    } else {
        result = isValidDomain(normalized);
    }
    
    const status = result === expected ? 'PASS' : 'FAIL';
    if (status === 'PASS') passed++;
    else failed++;
    
    console.log(`[${status}] ${type.padEnd(20)} | Input: "${domain}" | Expected: ${expected} | Got: ${result}`);
});

console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
    console.log('\nFIX NEEDED: Update validation logic for failed tests');
    process.exit(1);
} else {
    console.log('\nAll tests passed! Domain validation is correct.');
}
