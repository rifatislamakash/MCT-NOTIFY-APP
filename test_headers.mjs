async function checkHeaders() {
    console.log("Sending POST to Edge Function...");
    const res = await fetch('https://ngropmfrneaaejwocnbf.supabase.co/functions/v1/database-monitor', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer DUMMY_TOKEN'
        },
        body: JSON.stringify({ ping: true })
    });
    
    console.log("STATUS:", res.status);
    console.log("HEADERS:");
    for (const [key, val] of res.headers.entries()) {
        console.log(`  ${key}: ${val}`);
    }
    const text = await res.text();
    console.log("BODY:", text);
}

checkHeaders().catch(console.error);
