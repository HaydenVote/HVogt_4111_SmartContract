// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

contract ApartmentRental {

    // State variables
    address payable public owner;
    address public tenant;
    bool public occupied;
    uint public ratePerMonth;
    uint public depositAmount;

    // Events
    event Log(address indexed sender, string message);

    // Constructor — sets initial conditions
    constructor() {
        owner = payable(msg.sender);
        occupied = false;
        ratePerMonth = 1 ether;
        depositAmount = 2 ether; // 2-month security deposit
    }

    // -------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function.");
        _;
    }

    modifier onlyTenant() {
        require(msg.sender == tenant, "Only the current tenant can call this function.");
        _;
    }

    // -------------------------------------------------------
    // Public Functions
    // -------------------------------------------------------

    // Rent the apartment — requires deposit + first month's rent upfront
    function rentApartment(uint numMonths) public payable {
        require(!occupied, "Apartment is currently occupied.");
        require(numMonths >= 1, "Must rent for at least one month.");

        uint totalDue = depositAmount + (ratePerMonth * numMonths);
        require(msg.value >= totalDue, "Insufficient payment. Must cover deposit and rent.");

        tenant = msg.sender;
        occupied = true;

        // Forward rent (excluding deposit) to owner; contract holds the deposit
        uint rentDue = ratePerMonth * numMonths;
        (bool sent, ) = owner.call{value: rentDue}("");
        require(sent, "Failed to send rent to owner.");

        emit Log(msg.sender, "Apartment rented. Deposit held by contract.");
        emit Log(owner, "A new tenant has rented the apartment.");
    }

    // Tenant pays monthly rent
    function payRent() public payable onlyTenant {
        require(occupied, "No active lease.");
        require(msg.value >= ratePerMonth, "Insufficient rent payment.");

        (bool sent, ) = owner.call{value: msg.value}("");
        require(sent, "Failed to send rent to owner.");

        emit Log(msg.sender, "Rent payment sent.");
        emit Log(owner, "Rent payment received.");
    }

    // Tenant ends lease — deposit is returned
    function endLease() public onlyTenant {
        require(occupied, "No active lease to end.");

        address formerTenant = tenant;

        // Reset lease state before transfer to prevent reentrancy
        occupied = false;
        tenant = address(0);

        // Return deposit to tenant
        (bool sent, ) = payable(formerTenant).call{value: depositAmount}("");
        require(sent, "Failed to return deposit.");

        emit Log(formerTenant, "Lease ended. Deposit returned.");
        emit Log(owner, "Tenant has vacated. Apartment is now available.");
    }

    // Owner evicts tenant — deposit is forfeited to owner
    function evictTenant() public onlyOwner {
        require(occupied, "No tenant to evict.");

        address evictedTenant = tenant;

        // Reset lease state before transfer
        occupied = false;
        tenant = address(0);

        // Deposit forfeited to owner
        (bool sent, ) = owner.call{value: depositAmount}("");
        require(sent, "Failed to transfer forfeited deposit to owner.");

        emit Log(evictedTenant, "You have been evicted.");
        emit Log(owner, "Tenant evicted. Deposit forfeited to owner.");
    }

    // Owner updates the monthly rate
    function updateRate(uint newRate) public onlyOwner {
        require(newRate > 0, "Rate must be greater than zero.");
        ratePerMonth = newRate;
        emit Log(msg.sender, "Monthly rate has been updated.");
    }

    // Owner updates the deposit amount (only when unoccupied)
    function updateDeposit(uint newDeposit) public onlyOwner {
        require(!occupied, "Cannot change deposit while apartment is occupied.");
        require(newDeposit > 0, "Deposit must be greater than zero.");
        depositAmount = newDeposit;
        emit Log(msg.sender, "Deposit amount has been updated.");
    }

    // Transfer ownership of the contract to a new owner
    function transferOwnership(address payable newOwner) public onlyOwner {
        require(newOwner != address(0), "Invalid address.");
        owner = newOwner;
        emit Log(msg.sender, "Ownership has been transferred.");
        emit Log(newOwner, "You are the new owner of this contract.");
    }

    // Check the contract's current balance (holds deposit when occupied)
    function getContractBalance() public view returns (uint) {
        return address(this).balance;
    }

}
