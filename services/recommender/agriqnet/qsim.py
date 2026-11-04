"""Batched exact statevector simulator for small circuits (<= ~12 qubits).

Conventions match PennyLane: wire 0 is the most significant bit, and
RX/RY/RZ(t) = exp(-i t P / 2), IsingXX/YY/ZZ(t) = exp(-i t P(x)P / 2).
Every gate accepts either one angle or one angle per sample (shape (B,)).
"""
import numpy as np

I2 = np.eye(2, dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)
H = np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)
PAULI = {"I": I2, "X": X, "Y": Y, "Z": Z}
CNOT = np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0]], dtype=complex)


def _angles(theta, batch):
    theta = np.asarray(theta, dtype=float)
    if theta.ndim == 0:
        theta = np.full(batch, float(theta))
    return theta


def rx(theta):
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    m = np.empty(theta.shape + (2, 2), dtype=complex)
    m[..., 0, 0], m[..., 0, 1], m[..., 1, 0], m[..., 1, 1] = c, -1j * s, -1j * s, c
    return m


def ry(theta):
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    m = np.empty(theta.shape + (2, 2), dtype=complex)
    m[..., 0, 0], m[..., 0, 1], m[..., 1, 0], m[..., 1, 1] = c, -s, s, c
    return m


def rz(theta):
    m = np.zeros(theta.shape + (2, 2), dtype=complex)
    m[..., 0, 0] = np.exp(-0.5j * theta)
    m[..., 1, 1] = np.exp(0.5j * theta)
    return m


def rot(phi, theta, omega):
    """PennyLane qml.Rot(phi, theta, omega) = RZ(omega) RY(theta) RZ(phi)."""
    a = np.asarray
    return rz(a(omega, float)) @ ry(a(theta, float)) @ rz(a(phi, float))


def ising(pauli, theta):
    """exp(-i theta/2 P(x)P) for P in {X, Y, Z}; theta shape (B,)."""
    pp = np.kron(PAULI[pauli], PAULI[pauli])
    c, s = np.cos(theta / 2), np.sin(theta / 2)
    return c[:, None, None] * np.eye(4) - 1j * s[:, None, None] * pp


class StateBatch:
    """A batch of B pure states on n qubits, stored as shape (B, 2, ..., 2)."""

    def __init__(self, batch, n_qubits):
        self.B, self.n = int(batch), int(n_qubits)
        psi = np.zeros((self.B, 2 ** self.n), dtype=complex)
        psi[:, 0] = 1.0
        self.psi = psi.reshape((self.B,) + (2,) * self.n)

    def gate1(self, U, q):
        U = np.asarray(U, dtype=complex)
        ax = q + 1
        psi = np.moveaxis(self.psi, ax, 1)
        shp = psi.shape
        flat = psi.reshape(self.B, 2, -1)
        if U.ndim == 2:
            out = np.einsum("ij,bjm->bim", U, flat)
        else:
            out = np.einsum("bij,bjm->bim", U, flat)
        self.psi = np.moveaxis(out.reshape(shp), 1, ax)
        return self

    def gate2(self, U, q1, q2):
        U = np.asarray(U, dtype=complex)
        psi = np.moveaxis(self.psi, (q1 + 1, q2 + 1), (1, 2))
        shp = psi.shape
        flat = psi.reshape(self.B, 4, -1)
        if U.ndim == 2:
            out = np.einsum("ij,bjm->bim", U, flat)
        else:
            out = np.einsum("bij,bjm->bim", U, flat)
        self.psi = np.moveaxis(out.reshape(shp), (1, 2), (q1 + 1, q2 + 1))
        return self

    def RX(self, t, q):
        return self.gate1(rx(_angles(t, self.B)), q)

    def RY(self, t, q):
        return self.gate1(ry(_angles(t, self.B)), q)

    def RZ(self, t, q):
        return self.gate1(rz(_angles(t, self.B)), q)

    def H(self, q):
        return self.gate1(H, q)

    def ROT(self, phi, theta, omega, q):
        return self.gate1(rot(phi, theta, omega), q)

    def CNOT(self, c, t):
        return self.gate2(CNOT, c, t)

    def ISING(self, pauli, t, q1, q2):
        return self.gate2(ising(pauli, _angles(t, self.B)), q1, q2)

    def vector(self):
        return self.psi.reshape(self.B, -1)

    def rdm1(self, q):
        psi = np.moveaxis(self.psi, q + 1, 1).reshape(self.B, 2, -1)
        return np.einsum("bim,bjm->bij", psi, psi.conj())

    def rdm2(self, q1, q2):
        psi = np.moveaxis(self.psi, (q1 + 1, q2 + 1), (1, 2)).reshape(self.B, 4, -1)
        return np.einsum("bim,bjm->bij", psi, psi.conj())


def expval_1q(rho, pauli):
    return np.real(np.einsum("bij,ji->b", rho, PAULI[pauli]))


def expval_2q(rho, p1, p2):
    return np.real(np.einsum("bij,ji->b", rho, np.kron(PAULI[p1], PAULI[p2])))


def fidelity_kernel(states_a, states_b):
    """|<a|b>|^2 for every pair; states are (N, 2**n) complex arrays."""
    return np.abs(states_a.conj() @ states_b.T) ** 2
