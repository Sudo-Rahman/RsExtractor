/// Deterministic 64-bit FNV-1a hash for cache key generation.
pub(crate) fn stable_hash64(s: &str) -> u64 {
    const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut hash = FNV_OFFSET_BASIS;
    for byte in s.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }

    hash
}

#[cfg(test)]
mod tests {
    use super::stable_hash64;

    #[test]
    fn stable_hash64_is_stable_for_same_input() {
        let first = stable_hash64("hello world");
        let second = stable_hash64("hello world");
        assert_eq!(first, second);
    }

    #[test]
    fn stable_hash64_differs_for_different_inputs() {
        let first = stable_hash64("hello");
        let second = stable_hash64("world");
        assert_ne!(first, second);
    }

    #[test]
    fn stable_hash64_matches_known_vector() {
        assert_eq!(stable_hash64("hello world"), 0x779a65e7023cd2e7);
    }
}
