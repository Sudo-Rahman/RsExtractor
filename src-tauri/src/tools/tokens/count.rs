use tiktoken_rs::o200k_base_singleton;

/// Count tokens in a text using tiktoken o200k_base encoding (GPT-4o, GPT-5)
/// Runs async to avoid blocking the main thread
#[tauri::command]
pub(crate) async fn count_tokens(text: String) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        let bpe = o200k_base_singleton();
        bpe.encode_with_special_tokens(&text).len()
    })
    .await
    .map_err(|e| format!("Token counting failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::count_tokens;

    #[tokio::test]
    async fn count_tokens_returns_positive_count_for_non_empty_text() {
        let count = count_tokens("Hello world".to_string())
            .await
            .expect("token count should succeed");
        assert!(count > 0);
    }

    #[tokio::test]
    async fn count_tokens_returns_zero_for_empty_text() {
        let count = count_tokens(String::new())
            .await
            .expect("token count should succeed for empty text");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn count_tokens_handles_unicode_and_symbols() {
        let count = count_tokens("こんにちは 🌍 — مرحبا".to_string())
            .await
            .expect("token count should succeed for unicode text");
        assert!(count > 0);
    }

    #[tokio::test]
    async fn count_tokens_handles_long_input() {
        let long_text = "lorem ipsum ".repeat(10_000);
        let count = count_tokens(long_text)
            .await
            .expect("token count should succeed for long input");
        assert!(count > 1000);
    }
}
