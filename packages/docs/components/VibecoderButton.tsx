export function VibecoderButton() {
  return (
    <div style={{ margin: "1rem 0" }}>
      <button
        type="button"
        onClick={() => {
          const url = window.location.origin + "/web-research-sdk/llms.txt";
          navigator.clipboard.writeText(url);
          const el = document.getElementById("vibecoder-btn");
          if (el) {
            el.textContent = "Copied!";
            setTimeout(() => {
              el.textContent = "Prompt for vibecoders";
            }, 2000);
          }
        }}
        id="vibecoder-btn"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.625rem 1.25rem",
          borderRadius: "0.5rem",
          background: "transparent",
          border: "1px solid var(--vocs-color_accentColor, #6366f1)",
          color: "var(--vocs-color_accentColor, #6366f1)",
          fontWeight: 600,
          fontSize: "0.95rem",
          cursor: "pointer",
        }}
      >
        Prompt for vibecoders
      </button>
    </div>
  );
}
