// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title TenancyCredential
/// @notice A soulbound (non-transferable) ERC-721 minted exactly once per
/// lease, exclusively by RentPactEscrow, when — and only when — that lease
/// completes its full natural term (see RentPactEscrow's completedNaturally
/// flag and NatSpec on `mintForLease`). A tenancy credential only means
/// something if it's structurally impossible to earn one from a cancelled,
/// early-terminated, or breach-ruled lease.
/// @dev A hand-rolled, minimal ERC-721 (implements IERC721 + IERC721Metadata
/// directly) rather than inheriting OpenZeppelin's ERC721 — that base
/// contract transitively imports OZ's Strings/Bytes utilities, which use the
/// `mcopy` opcode (Cancun-only) that this project's other contract
/// deliberately avoids targeting, since Arc testnet's exact opcode support
/// isn't a risk worth taking for a purely cosmetic metadata helper. Every
/// transfer path (transferFrom, both safeTransferFrom overloads, approve,
/// setApprovalForAll) reverts unconditionally — soulbound by construction,
/// not by convention.
/// Metadata is fully on-chain: tokenURI returns a base64 data: JSON URI with
/// an inline SVG image — no off-chain server, nothing that can go stale or
/// disappear. Deliberately excludes the property address (privacy); includes
/// only outcome facts already recorded on the lease itself.
contract TenancyCredential is IERC721, IERC721Metadata {
    /// @dev propertyType is deliberately absent: RentPactEscrow never stores it
    /// (only leaseMetadataStore.ts does, off-chain, same as property address),
    /// so there is no real on-chain value to put here. The app overlays it as
    /// a display label when rendering the card instead of faking one on-chain.
    struct CredentialData {
        uint256 leaseId;
        uint256 durationDays;
        uint256 totalPeriods;
        uint256 onTimePeriods;
        uint256 disputesLost;
        uint256 completionDate; // block.timestamp the lease completed
    }

    string public constant name = "RentPact Tenancy Credential";
    string public constant symbol = "RPTC";

    /// @notice The only address permitted to mint — set once, immutably, at deploy.
    address public immutable escrow;

    uint256 private nextTokenId = 1;

    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(uint256 => CredentialData) private credentials;
    /// @notice tokenId minted for a given leaseId, 0 if none yet.
    mapping(uint256 => uint256) public tokenIdForLease;

    error NonTransferable();
    error NotEscrow();
    error AlreadyMinted();
    error TokenDoesNotExist();
    error ZeroAddress();

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow();
        _;
    }

    constructor(address escrow_) {
        if (escrow_ == address(0)) revert ZeroAddress();
        escrow = escrow_;
    }

    /// @notice Mints one credential to `tenant` for `leaseId`. Callable only by
    /// RentPactEscrow, only once per lease — RentPactEscrow itself is the source
    /// of truth on *when* this is appropriate to call (full natural completion);
    /// this contract's own job is just to refuse a duplicate for the same lease.
    function mintForLease(address tenant, CredentialData calldata data) external onlyEscrow returns (uint256 tokenId) {
        if (tenant == address(0)) revert ZeroAddress();
        if (tokenIdForLease[data.leaseId] != 0) revert AlreadyMinted();

        tokenId = nextTokenId++;
        tokenIdForLease[data.leaseId] = tokenId;
        credentials[tokenId] = data;
        owners[tokenId] = tenant;
        balances[tenant] += 1;

        emit Transfer(address(0), tenant, tokenId);
    }

    function credentialData(uint256 tokenId) external view returns (CredentialData memory) {
        _requireExists(tokenId);
        return credentials[tokenId];
    }

    // --- IERC721 ---

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = owners[tokenId];
        if (owner == address(0)) revert TokenDoesNotExist();
        return owner;
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        _requireExists(tokenId);
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert NonTransferable();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert NonTransferable();
    }

    function approve(address, uint256) external pure {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) external pure {
        revert NonTransferable();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC721).interfaceId ||
            interfaceId == type(IERC721Metadata).interfaceId;
    }

    // --- IERC721Metadata ---

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        _requireExists(tokenId);
        CredentialData memory d = credentials[tokenId];

        string memory json = string.concat(
            '{"name":"Verified Tenancy #',
            _toString(tokenId),
            '","description":"Proof of a fully completed RentPact tenancy. Soulbound, minted only on a clean, full-term lease completion.",',
            '"attributes":[',
            _attr("Duration (days)", _toString(d.durationDays), true),
            _attr("Total Periods", _toString(d.totalPeriods), true),
            _attr("On-Time Periods", _toString(d.onTimePeriods), true),
            _attr("Disputes Lost", _toString(d.disputesLost), true),
            _attr("Completion Date", _toString(d.completionDate), false),
            '],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(d))),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _requireExists(uint256 tokenId) private view {
        if (owners[tokenId] == address(0)) revert TokenDoesNotExist();
    }

    function _attr(string memory trait, string memory value, bool comma) private pure returns (string memory) {
        return string.concat('{"trait_type":"', trait, '","value":"', value, '"}', comma ? "," : "");
    }

    /// @dev Inline on-chain badge: forest-green card, gold border, a small
    /// house-and-checkmark mark (the closest a data: SVG gets to the brand
    /// logo without embedding a raster asset), and the credential's stats.
    function _svg(CredentialData memory d) private pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420">',
            '<rect width="420" height="420" rx="24" fill="#0B3D2E"/>',
            '<rect x="10" y="10" width="400" height="400" rx="18" fill="none" stroke="#D4A017" stroke-width="3"/>',
            '<g transform="translate(210,110)">',
            '<path d="M-38 10 L0 -28 L38 10 V52 A6 6 0 0 1 32 58 H-32 A6 6 0 0 1 -38 52 Z" fill="none" stroke="#D4A017" stroke-width="5" stroke-linejoin="round"/>',
            '<path d="M-14 20 L-2 34 L20 6" fill="none" stroke="#D4A017" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
            "</g>",
            '<text x="210" y="215" text-anchor="middle" font-family="Georgia, serif" font-size="15" letter-spacing="4" fill="#D4A017">RENTPACT</text>',
            '<text x="210" y="245" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#FAF6EF">Verified Tenancy</text>',
            '<line x1="60" y1="270" x2="360" y2="270" stroke="#D4A017" stroke-width="1" opacity="0.5"/>',
            '<text x="60" y="305" font-family="Arial" font-size="14" fill="#F2E9D8">Duration</text>',
            '<text x="360" y="305" text-anchor="end" font-family="Arial" font-size="14" fill="#FAF6EF">',
            d.durationDays == 0 ? "&lt;1 day" : string.concat(_toString(d.durationDays), " days"),
            "</text>",
            '<text x="60" y="332" font-family="Arial" font-size="14" fill="#F2E9D8">On-time periods</text>',
            '<text x="360" y="332" text-anchor="end" font-family="Arial" font-size="14" fill="#FAF6EF">',
            _toString(d.onTimePeriods),
            "/",
            _toString(d.totalPeriods),
            "</text>",
            '<text x="60" y="359" font-family="Arial" font-size="14" fill="#F2E9D8">Disputes lost</text>',
            '<text x="360" y="359" text-anchor="end" font-family="Arial" font-size="14" fill="#FAF6EF">',
            _toString(d.disputesLost),
            "</text>",
            '<text x="210" y="395" text-anchor="middle" font-family="Arial" font-size="11" letter-spacing="1" fill="#CCDCD5">SOULBOUND - ARC TESTNET</text>',
            "</svg>"
        );
    }

    /// @dev Minimal decimal-string conversion, written by hand instead of pulling in
    /// OpenZeppelin's Strings (which transitively imports Bytes.sol, which uses the
    /// `mcopy` opcode — not something to depend on for a purely cosmetic helper here).
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
