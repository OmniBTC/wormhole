module wormhole::keccak256 {
    use sui::ecdsa_k1;

    spec module {
        pragma verify=false;
    }

    public fun keccak256(bytes: vector<u8>): vector<u8> {
        ecdsa_k1::keccak256(&bytes)
    }

    spec keccak256 {
        pragma opaque;
    }

}
