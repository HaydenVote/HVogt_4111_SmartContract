const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ApartmentRental", function () {
  let contract;
  let owner, tenant, newOwner, stranger;

  // Helper — convert ETH to wei
  const toWei = (eth) => ethers.parseEther(eth.toString());

  // Deploy a fresh contract before each test
  beforeEach(async function () {
    [owner, tenant, newOwner, stranger] = await ethers.getSigners();
    const ApartmentRental = await ethers.getContractFactory("ApartmentRental");
    contract = await ApartmentRental.deploy();
  });

  // -------------------------------------------------------
  // Deployment
  // -------------------------------------------------------
  describe("Deployment", function () {
    it("Should set the deployer as the owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should initialize the apartment as unoccupied", async function () {
      expect(await contract.occupied()).to.equal(false);
    });

    it("Should set the initial rate to 1 ETH per month", async function () {
      expect(await contract.ratePerMonth()).to.equal(toWei(1));
    });

    it("Should set the initial deposit to 2 ETH", async function () {
      expect(await contract.depositAmount()).to.equal(toWei(2));
    });
  });

  // -------------------------------------------------------
  // rentApartment
  // -------------------------------------------------------
  describe("rentApartment()", function () {
    it("Should allow a tenant to rent with correct payment", async function () {
      // 2 ETH deposit + 1 ETH first month = 3 ETH total
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
      expect(await contract.occupied()).to.equal(true);
      expect(await contract.tenant()).to.equal(tenant.address);
    });

    it("Should forward rent to the owner", async function () {
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
      const ownerAfter = await ethers.provider.getBalance(owner.address);
      // Owner should have received 1 ETH rent (deposit stays in contract)
      expect(ownerAfter).to.be.greaterThan(ownerBefore);
    });

    it("Should hold deposit in the contract balance", async function () {
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
      const balance = await contract.getContractBalance();
      expect(balance).to.equal(toWei(2));
    });

    it("Should emit Log events on successful rental", async function () {
      await expect(
        contract.connect(tenant).rentApartment(1, { value: toWei(3) })
      ).to.emit(contract, "Log");
    });

    it("Should revert if apartment is already occupied", async function () {
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
      await expect(
        contract.connect(stranger).rentApartment(1, { value: toWei(3) })
      ).to.be.revertedWith("Apartment is currently occupied.");
    });

    it("Should revert if payment is insufficient", async function () {
      await expect(
        contract.connect(tenant).rentApartment(1, { value: toWei(1) })
      ).to.be.revertedWith("Insufficient payment. Must cover deposit and rent.");
    });

    it("Should revert if numMonths is zero", async function () {
      await expect(
        contract.connect(tenant).rentApartment(0, { value: toWei(3) })
      ).to.be.revertedWith("Must rent for at least one month.");
    });
  });

  // -------------------------------------------------------
  // payRent
  // -------------------------------------------------------
  describe("payRent()", function () {
    beforeEach(async function () {
      // Rent the apartment first
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
    });

    it("Should allow the tenant to pay rent", async function () {
      await expect(
        contract.connect(tenant).payRent({ value: toWei(1) })
      ).to.emit(contract, "Log");
    });

    it("Should forward rent payment to the owner", async function () {
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      await contract.connect(tenant).payRent({ value: toWei(1) });
      const ownerAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerAfter).to.be.greaterThan(ownerBefore);
    });

    it("Should revert if a non-tenant tries to pay rent", async function () {
      await expect(
        contract.connect(stranger).payRent({ value: toWei(1) })
      ).to.be.revertedWith("Only the current tenant can call this function.");
    });

    it("Should revert if payment is below the monthly rate", async function () {
      await expect(
        contract.connect(tenant).payRent({ value: toWei(0.5) })
      ).to.be.revertedWith("Insufficient rent payment.");
    });
  });

  // -------------------------------------------------------
  // endLease
  // -------------------------------------------------------
  describe("endLease()", function () {
    beforeEach(async function () {
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
    });

    it("Should allow tenant to end the lease", async function () {
      await contract.connect(tenant).endLease();
      expect(await contract.occupied()).to.equal(false);
      expect(await contract.tenant()).to.equal(ethers.ZeroAddress);
    });

    it("Should return the deposit to the tenant", async function () {
      const tenantBefore = await ethers.provider.getBalance(tenant.address);
      await contract.connect(tenant).endLease();
      const tenantAfter = await ethers.provider.getBalance(tenant.address);
      // Tenant should receive deposit back (minus gas)
      expect(tenantAfter).to.be.greaterThan(tenantBefore);
    });

    it("Should clear the contract balance after deposit return", async function () {
      await contract.connect(tenant).endLease();
      expect(await contract.getContractBalance()).to.equal(0);
    });

    it("Should revert if called by a non-tenant", async function () {
      await expect(
        contract.connect(stranger).endLease()
      ).to.be.revertedWith("Only the current tenant can call this function.");
    });
  });

  // -------------------------------------------------------
  // evictTenant
  // -------------------------------------------------------
  describe("evictTenant()", function () {
    beforeEach(async function () {
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
    });

    it("Should allow the owner to evict the tenant", async function () {
      await contract.connect(owner).evictTenant();
      expect(await contract.occupied()).to.equal(false);
      expect(await contract.tenant()).to.equal(ethers.ZeroAddress);
    });

    it("Should forfeit the deposit to the owner", async function () {
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      await contract.connect(owner).evictTenant();
      const ownerAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerAfter).to.be.greaterThan(ownerBefore);
    });

    it("Should revert if called by a non-owner", async function () {
      await expect(
        contract.connect(stranger).evictTenant()
      ).to.be.revertedWith("Only the owner can call this function.");
    });

    it("Should revert if there is no tenant to evict", async function () {
      await contract.connect(tenant).endLease(); // vacate first
      await expect(
        contract.connect(owner).evictTenant()
      ).to.be.revertedWith("No tenant to evict.");
    });
  });

  // -------------------------------------------------------
  // updateRate
  // -------------------------------------------------------
  describe("updateRate()", function () {
    it("Should allow the owner to update the monthly rate", async function () {
      await contract.connect(owner).updateRate(toWei(2));
      expect(await contract.ratePerMonth()).to.equal(toWei(2));
    });

    it("Should revert if called by a non-owner", async function () {
      await expect(
        contract.connect(stranger).updateRate(toWei(2))
      ).to.be.revertedWith("Only the owner can call this function.");
    });

    it("Should revert if new rate is zero", async function () {
      await expect(
        contract.connect(owner).updateRate(0)
      ).to.be.revertedWith("Rate must be greater than zero.");
    });
  });

  // -------------------------------------------------------
  // updateDeposit
  // -------------------------------------------------------
  describe("updateDeposit()", function () {
    it("Should allow the owner to update the deposit amount", async function () {
      await contract.connect(owner).updateDeposit(toWei(3));
      expect(await contract.depositAmount()).to.equal(toWei(3));
    });

    it("Should revert if apartment is currently occupied", async function () {
      await contract.connect(tenant).rentApartment(1, { value: toWei(3) });
      await expect(
        contract.connect(owner).updateDeposit(toWei(3))
      ).to.be.revertedWith("Cannot change deposit while apartment is occupied.");
    });

    it("Should revert if new deposit is zero", async function () {
      await expect(
        contract.connect(owner).updateDeposit(0)
      ).to.be.revertedWith("Deposit must be greater than zero.");
    });
  });

  // -------------------------------------------------------
  // transferOwnership
  // -------------------------------------------------------
  describe("transferOwnership()", function () {
    it("Should transfer ownership to a new owner", async function () {
      await contract.connect(owner).transferOwnership(newOwner.address);
      expect(await contract.owner()).to.equal(newOwner.address);
    });

    it("Should emit Log events on ownership transfer", async function () {
      await expect(
        contract.connect(owner).transferOwnership(newOwner.address)
      ).to.emit(contract, "Log");
    });

    it("Should revert if called by a non-owner", async function () {
      await expect(
        contract.connect(stranger).transferOwnership(newOwner.address)
      ).to.be.revertedWith("Only the owner can call this function.");
    });

    it("Should revert if new owner is the zero address", async function () {
      await expect(
        contract.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address.");
    });
  });
});
